# Troubleshooting Guide

## No notifications received?

### Step 1: Check if worker is deployed and accessible

```bash
# Test health endpoint
curl https://your-worker.workers.dev/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": 1705409400000,
  "hasToken": true,
  "hasTelegramToken": true,
  "hasChatId": true
}
```

If any of the `has*` fields are `false`, that secret is missing!

### Step 2: Verify secrets are set correctly

```bash
cd adapty-telegram-webhook

# Check if secrets are set (won't show values, just confirms they exist)
npx wrangler secret list

# If missing, set them:
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put WEBHOOK_AUTH_TOKEN
```

### Step 3: Test with curl (bypass Adapty)

```bash
# Run the simple test script
./test-webhook-simple.sh

# Or manually:
curl -X POST "https://your-worker.workers.dev/webhook" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN_HERE" \
  -d '{
    "event_type": "subscription_started",
    "event_datetime": "2025-01-16T10:30:00.000000+0000",
    "profile_id": "test-123",
    "product_id": "premium_monthly",
    "access_level_id": "premium",
    "store": "app_store",
    "price": 9.99,
    "environment": "sandbox",
    "profile_country": "US"
  }'
```

### Step 4: Check worker logs in real-time

```bash
# In one terminal, watch logs:
npx wrangler tail

# In another terminal, send a test:
./test-webhook-simple.sh
```

You should see detailed logs like:
```
🔔 Webhook request received: { method: 'POST', url: '...' }
🔑 Auth header present: true
✅ Authorization verified
📦 Webhook payload: { event_type: 'subscription_started', ... }
📋 Event type: subscription_started
✅ Processing tracked event: subscription_started
📤 Sending to Telegram: { chatId: '...', messageLength: 150 }
📥 Telegram API response: { status: 200, ... }
✅ Telegram notification sent successfully
```

### Step 5: Verify Telegram Bot setup

1. **Check bot token:**
   ```bash
   # Replace YOUR_BOT_TOKEN with your actual token
   curl https://api.telegram.org/botYOUR_BOT_TOKEN/getMe
   ```
   Should return bot info (not an error)

2. **Check chat ID:**
   - Search for **@userinfobot** on Telegram
   - Start a chat with it
   - It will reply with your chat ID
   - Make sure it matches what you set in `TELEGRAM_CHAT_ID`

3. **Start a chat with your bot:**
   - Find your bot in Telegram (name you gave it)
   - Send `/start` to begin the conversation
   - Without this, the bot cannot send you messages!

### Step 6: Check Adapty webhook configuration

1. Go to Adapty Dashboard → Integrations → Webhook
2. Verify:
   - **URL**: `https://your-worker.workers.dev/webhook`
   - **Authorization**: `Bearer YOUR_AUTH_TOKEN_HERE`
   - **Events selected**: subscription_started, subscription_renewed, subscription_renewal_cancelled, subscription_renewal_reactivated

3. Look for "Last delivery" timestamp - this shows if Adapty is trying to send webhooks

### Step 7: Check Adapty event logs

1. Go to Adapty Dashboard → Event Feed
2. Filter by event type (subscription_started, etc.)
3. Click on an event to see delivery details
4. If webhook delivery failed, you'll see the error message here

## Common Issues

### Issue: "Missing Authorization header" error

**Cause:** Authorization header not set correctly in Adapty Dashboard

**Fix:** Make sure you include `Bearer ` prefix in Adapty:
```
Bearer YOUR_AUTH_TOKEN_HERE
```

### Issue: "Invalid authorization token" error

**Cause:** Token in Adapty doesn't match `WEBHOOK_AUTH_TOKEN` secret

**Fix:**
1. Check what token you set: look at the Adapty Dashboard
2. Make sure it matches what you set with `wrangler secret put WEBHOOK_AUTH_TOKEN`
3. If unsure, generate a new token and update both places:
   ```bash
   openssl rand -base64 32
   # Copy the output

   # Set in worker:
   npx wrangler secret put WEBHOOK_AUTH_TOKEN
   # Paste the new token

   # Update in Adapty Dashboard:
   # Go to Integrations → Webhook → Edit
   # Authorization header: Bearer <new-token>
   ```

### Issue: Worker logs show "Telegram API error"

**Cause:** Invalid bot token or chat ID

**Fix:**
1. Verify bot token works:
   ```bash
   curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe
   ```

2. Get correct chat ID from **@userinfobot**

3. Update secrets:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   ```

### Issue: No events in Adapty Event Feed

**Cause:** No real subscription events happening yet

**Solution:**
1. Test purchases in App Store sandbox or Google Play testing
2. Or wait for real users to subscribe
3. Use the curl test script to simulate events in the meantime

### Issue: Events show in Adapty but webhook not triggered

**Cause:** Event type not configured in Adapty webhook settings

**Fix:**
1. Go to Adapty Dashboard → Integrations → Webhook
2. Click "Edit"
3. Make sure these events are checked:
   - subscription_started
   - subscription_renewed
   - subscription_renewal_cancelled
   - subscription_renewal_reactivated

## Debug Checklist

- [ ] Worker deployed: `npm run deploy`
- [ ] Health check passes: `curl .../health`
- [ ] All 3 secrets set: `npx wrangler secret list`
- [ ] Bot token valid: `curl https://api.telegram.org/bot.../getMe`
- [ ] Chat with bot started: sent `/start` to bot
- [ ] Test script works: `./test-webhook-simple.sh`
- [ ] Logs visible: `npx wrangler tail`
- [ ] Adapty URL correct in dashboard
- [ ] Adapty auth token correct (with `Bearer ` prefix)
- [ ] Adapty events selected (4 events)

## Still not working?

1. **Share worker logs:**
   ```bash
   npx wrangler tail > webhook-logs.txt
   # Send test event
   # Share webhook-logs.txt
   ```

2. **Test manually and share response:**
   ```bash
   curl -v -X POST "https://your-worker.workers.dev/webhook" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_AUTH_TOKEN_HERE" \
     -d '{
       "event_type": "subscription_started",
       "event_datetime": "2025-01-16T10:30:00.000000+0000",
       "profile_id": "test",
       "product_id": "test"
     }' 2>&1 | tee curl-debug.txt
   ```

3. **Check Adapty delivery logs** in Dashboard → Event Feed → Click event → Delivery tab
