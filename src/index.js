/**
 * Adapty Webhook to Telegram Bot
 * Receives subscription events from Adapty and sends notifications to Telegram
 */

// Telegram Bot API endpoint
const TELEGRAM_API = 'https://api.telegram.org';

// Event types we care about
const TRACKED_EVENTS = [
  'subscription_started',              // New subscription started
  'subscription_renewed',              // Subscription renewed
  'subscription_renewal_cancelled',    // Auto-renewal cancelled
  'subscription_renewal_reactivated',  // Auto-renewal reactivated
  'non_subscription_purchase'          // One-time purchases (credit packs)
];

export default {
  async fetch(request, env, ctx) {
    console.log('🔔 Webhook request received:', {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers)
    });

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      console.log('✅ CORS preflight handled');
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health' && request.method === 'GET') {
      console.log('✅ Health check passed');
      return new Response(JSON.stringify({
        status: 'ok',
        timestamp: Date.now(),
        hasToken: !!env.WEBHOOK_AUTH_TOKEN,
        hasTelegramToken: !!env.TELEGRAM_BOT_TOKEN,
        hasChatId: !!env.TELEGRAM_CHAT_ID
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Webhook endpoint
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        console.log('📥 Webhook POST request received');

        // Verify Authorization Bearer token
        const authHeader = request.headers.get('Authorization');
        console.log('🔑 Auth header present:', !!authHeader);

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          console.error('❌ Missing or invalid Authorization header');
          return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        console.log('🔑 Token extracted, length:', token.length);
        console.log('🔑 Expected token length:', env.WEBHOOK_AUTH_TOKEN?.length || 0);

        if (token !== env.WEBHOOK_AUTH_TOKEN) {
          console.error('❌ Invalid authorization token');
          console.error('Received token:', token.substring(0, 10) + '...');
          console.error('Expected token:', env.WEBHOOK_AUTH_TOKEN?.substring(0, 10) + '...');
          return new Response(JSON.stringify({ error: 'Invalid authorization token' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log('✅ Authorization verified');

        const body = await request.json();
        console.log('📦 Webhook payload:', JSON.stringify(body, null, 2));

        // Process the webhook event
        const eventType = body.event_type;
        console.log('📋 Event type:', eventType);
        console.log('📋 Tracked events:', TRACKED_EVENTS);
        console.log('📋 Is tracked:', TRACKED_EVENTS.includes(eventType));

        // Check environment - skip sandbox events
        // Environment is nested in event_properties, not at root level
        const environment = body.event_properties?.environment || body.environment || 'Unknown';
        console.log('🌍 Environment:', environment);
        console.log('🌍 Event properties:', JSON.stringify(body.event_properties || {}));

        if (environment === 'Sandbox') {
          console.log('⏭️ Skipping sandbox event - not sending notification');
          console.log(`Sandbox event details: ${eventType} for profile ${body.profile_id}`);

          // Return success to Adapty but don't send Telegram notification
          return new Response(JSON.stringify({
            success: true,
            event_type: eventType,
            skipped: true,
            reason: 'sandbox_environment'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Only process tracked events
        if (TRACKED_EVENTS.includes(eventType)) {
          console.log('✅ Processing tracked production event:', eventType);

          const message = formatTelegramMessage(body);
          console.log('📝 Formatted message:', message);

          console.log('🤖 Telegram config:', {
            hasToken: !!env.TELEGRAM_BOT_TOKEN,
            hasChatId: !!env.TELEGRAM_CHAT_ID,
            chatId: env.TELEGRAM_CHAT_ID
          });

          await sendTelegramNotification(message, env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
          console.log('✅ Telegram notification sent successfully');

          console.log(`✅ Processed event: ${eventType} for profile ${body.profile_id}`);
        } else {
          console.log('⏭️ Skipping untracked event:', eventType);
        }

        // Always return 200 to Adapty to acknowledge receipt
        console.log('✅ Returning success response to Adapty');
        return new Response(JSON.stringify({ success: true, event_type: eventType }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('❌ Error processing webhook:', error);
        console.error('Error details:', {
          message: error.message,
          stack: error.stack
        });

        // Still return 200 to prevent Adapty retries
        return new Response(JSON.stringify({
          error: error.message,
          stack: error.stack
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Unknown endpoint
    console.log('❌ Unknown endpoint:', url.pathname);
    return new Response('Not found', { status: 404, headers: corsHeaders });
  }
};

/**
 * Format webhook data into a Telegram message
 * @param {Object} data - Webhook event data
 * @returns {string} - Formatted message
 */
function formatTelegramMessage(data) {
  const eventType = data.event_type;
  const profileId = data.profile_id || 'Unknown';
  const customerUserId = data.customer_user_id || 'N/A';

  // Get subscription details from event_properties
  const props = data.event_properties || {};

  const accessLevel = data.access_level_id || 'Unknown';
  const productId = props.vendor_product_id || data.product_id || 'Unknown';
  const store = props.store || data.store || 'Unknown';

  // Price information (prefer local currency, fallback to USD)
  const priceLocal = props.price_local;
  const priceUsd = props.price_usd;
  const currency = props.currency || data.currency || 'USD';
  let priceDisplay = 'N/A';
  if (priceLocal && currency) {
    priceDisplay = `${currency} ${priceLocal}`;
    if (priceUsd && currency !== 'USD') {
      priceDisplay += ` ($${priceUsd})`;
    }
  } else if (priceUsd) {
    priceDisplay = `$${priceUsd}`;
  } else if (data.price) {
    priceDisplay = `$${data.price}`;
  }

  // Revenue information (after platform cuts and taxes)
  const netRevenueUsd = props.net_revenue_usd;
  const netRevenueLocal = props.net_revenue_local;
  let revenueDisplay = null;
  if (netRevenueLocal && currency) {
    revenueDisplay = `${currency} ${netRevenueLocal}`;
    if (netRevenueUsd && currency !== 'USD') {
      revenueDisplay += ` ($${netRevenueUsd})`;
    }
  } else if (netRevenueUsd) {
    revenueDisplay = `$${netRevenueUsd}`;
  }

  // Improved environment detection (nested in event_properties)
  const environment = props.environment || data.environment || 'Unknown';
  const environmentBadge = environment === 'Production' ? '🟢 Production' :
                          environment === 'Sandbox' ? '🟡 Sandbox' :
                          `⚪ ${environment}`;

  const country = props.store_country || props.profile_country || data.profile_country || 'Unknown';

  // Additional useful fields
  const consecutivePayments = props.consecutive_payments;
  const subscriptionExpiresAt = props.subscription_expires_at;
  const paywallName = props.paywall_name;
  const basePlanId = props.base_plan_id;

  // Format timestamp
  const timestamp = new Date(data.event_datetime).toLocaleString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  // Emoji based on event type
  let emoji = '📱';
  let title = '';

  switch (eventType) {
    case 'subscription_started':
      emoji = '🎉';
      title = 'NEW SUBSCRIPTION STARTED';
      break;
    case 'subscription_renewed':
      emoji = '🔄';
      title = 'SUBSCRIPTION RENEWED';
      break;
    case 'subscription_renewal_cancelled':
      emoji = '⚠️';
      title = 'AUTO-RENEWAL CANCELLED';
      break;
    case 'subscription_renewal_reactivated':
      emoji = '✅';
      title = 'AUTO-RENEWAL REACTIVATED';
      break;
    case 'non_subscription_purchase':
      emoji = '💰';
      title = 'CREDIT PACK PURCHASED';
      break;
    default:
      emoji = '📱';
      title = eventType.toUpperCase().replace(/_/g, ' ');
  }

  // Build message
  let message = `${emoji} <b>${title}</b>\n\n`;

  // Product & Subscription Info
  message += `<b>📦 Product:</b> ${productId}\n`;
  if (basePlanId) {
    message += `<b>Plan ID:</b> ${basePlanId}\n`;
  }
  message += `<b>🎯 Access Level:</b> ${accessLevel}\n`;

  // Financial Info
  message += `<b>💰 Price:</b> ${priceDisplay}\n`;
  if (revenueDisplay) {
    message += `<b>💵 Net Revenue:</b> ${revenueDisplay}\n`;
  }

  // Store & Location
  message += `<b>🏪 Store:</b> ${store}\n`;
  message += `<b>🌍 Country:</b> ${country}\n`;

  // Subscription Status
  if (consecutivePayments) {
    message += `<b>🔢 Consecutive Payments:</b> ${consecutivePayments}\n`;
  }
  if (subscriptionExpiresAt) {
    const expiryDate = new Date(subscriptionExpiresAt).toLocaleString('en-US', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    message += `<b>⏰ Expires:</b> ${expiryDate} UTC\n`;
  }

  // Paywall tracking
  if (paywallName) {
    message += `<b>📊 Paywall:</b> ${paywallName}\n`;
  }

  // Environment badge
  message += `<b>🔧 Environment:</b> ${environmentBadge}\n`;

  // User IDs
  message += `\n<b>👤 Profile ID:</b> <code>${profileId}</code>\n`;
  if (customerUserId !== 'N/A') {
    message += `<b>User ID:</b> ${customerUserId}\n`;
  }

  message += `\n<i>🕐 ${timestamp} UTC</i>`;

  return message;
}

/**
 * Send notification to Telegram
 * @param {string} message - Message to send
 * @param {string} botToken - Telegram bot token
 * @param {string} chatId - Telegram chat ID
 * @returns {Promise<void>}
 */
async function sendTelegramNotification(message, botToken, chatId) {
  const url = `${TELEGRAM_API}/bot${botToken}/sendMessage`;

  console.log('📤 Sending to Telegram:', {
    url: url.substring(0, 50) + '...',
    chatId,
    messageLength: message.length
  });

  const payload = {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  console.log('📥 Telegram API response:', {
    status: response.status,
    statusText: response.statusText,
    body: responseText
  });

  if (!response.ok) {
    console.error('❌ Telegram API error:', responseText);
    throw new Error(`Telegram API error: ${responseText}`);
  }

  return JSON.parse(responseText);
}
