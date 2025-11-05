#!/bin/bash

# Test script for Adapty Telegram Webhook
# This simulates Adapty sending webhook events to your worker

# Configuration - Set these environment variables or edit directly
WEBHOOK_URL="${WEBHOOK_URL:-https://your-worker.workers.dev/webhook}"
AUTH_TOKEN="${WEBHOOK_AUTH_TOKEN:-your-webhook-auth-token-here}"

# Check if using default values
if [[ "$WEBHOOK_URL" == "https://your-worker.workers.dev/webhook" ]]; then
  echo "⚠️  Warning: Using default WEBHOOK_URL. Set the WEBHOOK_URL environment variable or edit this script."
  echo "   Example: export WEBHOOK_URL=https://your-worker.workers.dev/webhook"
  echo ""
fi

if [[ "$AUTH_TOKEN" == "your-webhook-auth-token-here" ]]; then
  echo "❌ Error: AUTH_TOKEN not set. Set the WEBHOOK_AUTH_TOKEN environment variable or edit this script."
  echo "   Example: export WEBHOOK_AUTH_TOKEN=your-actual-token"
  exit 1
fi

echo "Testing Adapty Webhook..."
echo ""

# Test 1: Health check
echo "1. Testing health endpoint..."
curl -s "$WEBHOOK_URL/../health" | jq '.'
echo ""
echo ""

# Test 2: subscription_started event (PRODUCTION)
echo "2. Testing subscription_started event (PRODUCTION)..."
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "event_type": "subscription_started",
    "event_datetime": "'$(date -u +"%Y-%m-%dT%H:%M:%S.000000+0000")'",
    "profile_id": "12345678-abcd-1234-efgh-123456789012",
    "customer_user_id": "test_user_123",
    "product_id": "premium_monthly",
    "access_level_id": "premium",
    "store": "app_store",
    "price": 9.99,
    "currency": "USD",
    "profile_country": "US",
    "event_properties": {
      "environment": "Production"
    }
  }' | jq '.'
echo ""
echo ""

# Test 3: subscription_renewed event (PRODUCTION)
echo "3. Testing subscription_renewed event (PRODUCTION)..."
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "event_type": "subscription_renewed",
    "event_datetime": "'$(date -u +"%Y-%m-%dT%H:%M:%S.000000+0000")'",
    "profile_id": "87654321-dcba-4321-hgfe-210987654321",
    "customer_user_id": "test_user_456",
    "product_id": "premium_yearly",
    "access_level_id": "premium",
    "store": "play_store",
    "price": 99.99,
    "currency": "USD",
    "profile_country": "CA",
    "event_properties": {
      "environment": "Production"
    }
  }' | jq '.'
echo ""
echo ""

# Test 4: subscription_renewal_cancelled event (PRODUCTION)
echo "4. Testing subscription_renewal_cancelled event (PRODUCTION)..."
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "event_type": "subscription_renewal_cancelled",
    "event_datetime": "'$(date -u +"%Y-%m-%dT%H:%M:%S.000000+0000")'",
    "profile_id": "11111111-2222-3333-4444-555555555555",
    "customer_user_id": "test_user_789",
    "product_id": "premium_monthly",
    "access_level_id": "premium",
    "store": "app_store",
    "price": 9.99,
    "currency": "USD",
    "profile_country": "GB",
    "event_properties": {
      "environment": "Production"
    }
  }' | jq '.'
echo ""
echo ""

# Test 5: subscription_renewal_reactivated event (PRODUCTION)
echo "5. Testing subscription_renewal_reactivated event (PRODUCTION)..."
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "event_type": "subscription_renewal_reactivated",
    "event_datetime": "'$(date -u +"%Y-%m-%dT%H:%M:%S.000000+0000")'",
    "profile_id": "99999999-8888-7777-6666-555555555555",
    "customer_user_id": "test_user_999",
    "product_id": "premium_monthly",
    "access_level_id": "premium",
    "store": "app_store",
    "price": 9.99,
    "currency": "USD",
    "profile_country": "AU",
    "event_properties": {
      "environment": "Production"
    }
  }' | jq '.'
echo ""
echo ""

# Test 6: Invalid auth token (should fail)
echo "6. Testing invalid auth token (should return 401)..."
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer INVALID_TOKEN" \
  -d '{
    "event_type": "subscription_started",
    "event_datetime": "'$(date -u +"%Y-%m-%dT%H:%M:%S.000000+0000")'",
    "profile_id": "test",
    "product_id": "test"
  }' | jq '.'
echo ""
echo ""

# Test 7: Missing auth header (should fail)
echo "7. Testing missing auth header (should return 401)..."
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "subscription_started",
    "event_datetime": "'$(date -u +"%Y-%m-%dT%H:%M:%S.000000+0000")'",
    "profile_id": "test",
    "product_id": "test"
  }' | jq '.'
echo ""
echo ""

# Test 8: Sandbox event (should be FILTERED - no Telegram notification)
echo "8. Testing SANDBOX event (should be FILTERED, no Telegram notification)..."
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "event_type": "subscription_started",
    "event_datetime": "'$(date -u +"%Y-%m-%dT%H:%M:%S.000000+0000")'",
    "profile_id": "sandbox-test-123",
    "customer_user_id": "sandbox_user",
    "product_id": "premium_monthly",
    "access_level_id": "premium",
    "store": "app_store",
    "price": 9.99,
    "currency": "USD",
    "profile_country": "US",
    "event_properties": {
      "environment": "Sandbox"
    }
  }' | jq '.'
echo ""
echo ""

echo "✅ Test complete! Check your Telegram bot for 4 notifications (tests 2-5)"
echo "ℹ️  Test 8 (sandbox) should NOT send a notification - check worker logs to confirm filtering"
