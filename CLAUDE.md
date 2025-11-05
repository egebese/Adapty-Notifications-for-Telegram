# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Adapty Telegram Webhook** - A Cloudflare Worker that receives webhook events from Adapty (subscription management platform) and forwards them as formatted notifications to Telegram. Designed for mobile app developers who want real-time subscription insights.

**Key Purpose:** Monitor production subscription events (new subscriptions, renewals, cancellations, credit pack purchases) in real-time via Telegram.

## Quick Setup for New Users

When helping users set up this project for the first time, follow this sequence:

### 1. Initial Setup
```bash
npm install
```

### 2. Telegram Bot Creation
Guide users to:
1. Open Telegram and message @BotFather
2. Send `/newbot` and follow prompts
3. Save the bot token (format: `123456789:ABCdefGHI...`)
4. Message @userinfobot to get their chat ID

### 3. Generate Auth Token
```bash
# macOS/Linux
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 4. Configure Secrets
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put WEBHOOK_AUTH_TOKEN
```

### 5. Deploy
```bash
npm run deploy
```

### 6. Test
After deployment, set environment variables and test:
```bash
export WEBHOOK_URL=https://[worker-url]/webhook
export WEBHOOK_AUTH_TOKEN=[same-token-as-step-4]
./test-webhook-simple.sh
```

## Architecture

### Platform: Cloudflare Workers
- **Runtime:** Service Worker API (NOT Node.js - use Web APIs only)
- **Entry Point:** `src/index.js` - ES6 module with `export default { async fetch() }` handler
- **Configuration:** `wrangler.toml` - Cloudflare Workers config
- **Deployment:** Wrangler CLI

### Request Flow
1. Adapty → POST to `/webhook` with Bearer token + JSON payload
2. Worker validates `Authorization: Bearer [token]` against `env.WEBHOOK_AUTH_TOKEN`
3. **Critical:** Filters out sandbox events - only `environment === 'Production'` triggers Telegram
4. Formats event into HTML message
5. Sends to Telegram Bot API with `parse_mode: HTML`

### Security Model
- **Bearer token authorization** - Required on webhook endpoint
- **Secrets via Wrangler** - `npx wrangler secret put <NAME>`
- **Always returns 200** - Even on errors (prevents Adapty retries)
- **No hardcoded credentials** - All in Cloudflare Workers secrets

## File Structure

```
adapty-telegram-webhook/
├── src/
│   └── index.js              # Main worker (fetch handler, message formatting, Telegram API)
├── wrangler.toml             # Worker config (routes optional)
├── package.json              # Scripts: deploy, dev, tail
├── test-webhook.sh           # Full test suite (8 tests)
├── test-webhook-simple.sh    # Quick single-event test
├── .env.example              # Template for test env vars
└── .gitignore                # Includes .env, .wrangler/, .dev.vars
```

## Key Files

### `src/index.js` (365 lines)
Main worker with three functions:
1. **`fetch(request, env, ctx)`** - Main handler (lines 19-169)
   - `GET /health` - Health check endpoint
   - `POST /webhook` - Main webhook with Bearer auth
   - `OPTIONS /*` - CORS preflight
2. **`formatTelegramMessage(data)`** - Formats webhook → HTML (lines 176-318)
3. **`sendTelegramNotification(message, botToken, chatId)`** - Sends to Telegram (lines 327-364)

### `wrangler.toml`
- Worker name: `adapty-telegram-webhook`
- Optional routes (commented out by default)
- Observability enabled with full logging

## Environment Variables (Secrets)

**IMPORTANT:** These are Cloudflare Workers secrets, NOT environment variables in `.env`:

- `TELEGRAM_BOT_TOKEN` - From @BotFather (format: `123456789:ABC...`)
- `TELEGRAM_CHAT_ID` - From @userinfobot or getUpdates API
- `WEBHOOK_AUTH_TOKEN` - Generated with `openssl rand -base64 32`

Set with: `npx wrangler secret put <SECRET_NAME>`

**Testing scripts** use environment variables (`WEBHOOK_URL`, `WEBHOOK_AUTH_TOKEN`) to test the deployed worker.

## Common Commands

### Development
```bash
npm run dev      # Local dev server with hot reload
npm run tail     # Live production logs (critical for debugging)
npm run deploy   # Deploy to Cloudflare Workers
```

### Testing
```bash
# Set test environment (replace with actual values)
export WEBHOOK_URL=https://your-worker.workers.dev/webhook
export WEBHOOK_AUTH_TOKEN=your-auth-token

# Quick test
./test-webhook-simple.sh

# Full suite (4 events + security + sandbox filtering)
./test-webhook.sh

# Health check
curl https://your-worker.workers.dev/health
```

### Secrets Management
```bash
# Set new secret
npx wrangler secret put SECRET_NAME

# List secrets (values hidden)
npx wrangler secret list

# Delete secret
npx wrangler secret delete SECRET_NAME
```

## Event Processing Logic

### Tracked Events
Defined in `TRACKED_EVENTS` array (line 10):
```javascript
[
  'subscription_started',              // 🎉 New subscription
  'subscription_renewed',              // 🔄 Renewal
  'subscription_renewal_cancelled',    // ⚠️ Auto-renewal off
  'subscription_renewal_reactivated',  // ✅ Auto-renewal on
  'non_subscription_purchase'          // 💰 Credit pack
]
```

### Sandbox Filtering (CRITICAL)
**Lines 103-117:** Sandbox events are **accepted but NOT sent to Telegram**
```javascript
if (environment === 'Sandbox') {
  // Returns 200 with skipped: true
  // No Telegram notification sent
}
```

Environment detection: `body.event_properties.environment === 'Production'|'Sandbox'`

To enable sandbox notifications: Comment out lines 103-117

## Message Formatting

### Data Sources
Webhook payload has two levels:
1. **Root level** - Basic fields (`profile_id`, `customer_user_id`, `event_type`, `event_datetime`)
2. **event_properties** - Detailed data (`vendor_product_id`, `price_local`, `net_revenue_usd`, `environment`, etc.)

### Formatted Fields
`formatTelegramMessage()` includes:
- Event title with emoji (🎉/🔄/⚠️/✅/💰)
- Product ID, base plan, access level
- Price: Local currency + USD conversion
- Net revenue: Your earnings after platform cuts
- Store, country, consecutive payments
- Subscription expiry, paywall name
- Environment badge (🟢 Production / 🟡 Sandbox)
- Profile ID, customer user ID

### HTML Formatting
Uses Telegram HTML mode:
- `<b>bold</b>` for labels
- `<code>monospace</code>` for IDs
- `<i>italic</i>` for timestamp

## Cloudflare Workers Specifics

**IMPORTANT Constraints:**
- ❌ No Node.js APIs (no `fs`, `path`, `process.env`, etc.)
- ✅ Use Web APIs (fetch, Request, Response, URL)
- ✅ Secrets via `env` parameter (not `process.env`)
- ✅ Always return Response objects
- ✅ Use `ctx.waitUntil()` for background tasks

### Error Handling Pattern
```javascript
try {
  // Process webhook
} catch (error) {
  // Still return 200 OK to prevent Adapty retries
  return new Response(JSON.stringify({ error }), { status: 200 });
}
```

## Debugging Tips

### 1. Check Logs First
```bash
npm run tail
# Shows real-time logs from production
# Look for: Authorization errors, environment detection, Telegram API responses
```

### 2. Health Endpoint
```bash
curl https://your-worker.workers.dev/health
# Returns:
# - hasToken: boolean (WEBHOOK_AUTH_TOKEN set?)
# - hasTelegramToken: boolean
# - hasChatId: boolean
```

### 3. Test Scripts
Both scripts (`test-webhook.sh`, `test-webhook-simple.sh`) require:
- `WEBHOOK_URL` environment variable
- `WEBHOOK_AUTH_TOKEN` environment variable

If not set, scripts will error with instructions.

### 4. Common Issues
- **No notifications:** Check `npm run tail` for environment filtering (sandbox vs production)
- **401 errors:** Token mismatch - logs show first 10 chars of received vs expected (line 78-79)
- **Bot not sending:** Ensure `/start` sent to bot first
- **Test script fails:** Export `WEBHOOK_URL` and `WEBHOOK_AUTH_TOKEN` first

## Customization Points

### Add/Remove Events
Edit `TRACKED_EVENTS` array (line 10)

### Enable Sandbox Notifications
Comment out sandbox filter block (lines 103-117)

### Change Message Format
Edit `formatTelegramMessage()` function (line 176)
- Modify emoji mapping (line 239-266)
- Add/remove fields (line 269-315)
- Change HTML formatting

### Add Custom Endpoints
In main `fetch()` handler:
```javascript
if (url.pathname === '/custom' && request.method === 'POST') {
  // Your logic
}
```

### Custom Domain
Uncomment and edit in `wrangler.toml`:
```toml
[[routes]]
pattern = "webhook.yourdomain.com/*"
zone_name = "yourdomain.com"
```

## Adapty Integration

### Webhook Configuration
In Adapty Dashboard → Integrations → Webhooks:
- **Production endpoint:** `https://your-worker.workers.dev/webhook`
- **Authorization:** `Bearer [WEBHOOK_AUTH_TOKEN]`
- **Sandbox endpoint:** Same URL (filtered in code)
- **Events:** Select from `TRACKED_EVENTS` list

### Webhook Payload Structure
Adapty sends:
```json
{
  "event_type": "subscription_started",
  "event_datetime": "2025-01-15T10:30:00.000000+0000",
  "profile_id": "...",
  "customer_user_id": "...",
  "event_properties": {
    "environment": "Production",
    "vendor_product_id": "...",
    "price_usd": 9.99,
    "net_revenue_usd": 6.99,
    ...
  }
}
```

## Helping Users Set Up

When a user asks for help setting up:

1. **Check if deployed:** Ask for worker URL or help them deploy
2. **Verify secrets:** Run `/health` endpoint to check boolean flags
3. **Test locally first:** Use test scripts before configuring Adapty
4. **Check logs:** `npm run tail` is critical for debugging
5. **Adapty last:** Configure Adapty webhook only after worker tests pass

## Common User Requests

### "How do I customize messages?"
→ Edit `formatTelegramMessage()` in `src/index.js` line 176

### "Can I send to multiple chats?"
→ Would need to modify `sendTelegramNotification()` to loop through chat IDs

### "How do I add more event types?"
→ Add to `TRACKED_EVENTS` array (line 10), update emoji mapping (line 239-266)

### "Can I filter by product ID or country?"
→ Add conditional logic in webhook handler before sending to Telegram (around line 120)

### "How do I see sandbox events?"
→ Comment out sandbox filter block (lines 103-117) and redeploy

## Resources

- [Adapty Webhooks](https://docs.adapty.io/docs/webhook)
- [Adapty Events](https://docs.adapty.io/docs/webhook-event-types-and-fields)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
