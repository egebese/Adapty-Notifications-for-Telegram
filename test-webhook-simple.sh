#!/bin/bash

# Simple test - just send one subscription_started event

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

curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "event_type": "subscription_started",
    "event_datetime": "2025-01-16T10:30:00.000000+0000",
    "profile_id": "test-profile-12345",
    "customer_user_id": "test_user",
    "product_id": "premium_monthly",
    "access_level_id": "premium",
    "store": "app_store",
    "price": 9.99,
    "currency": "USD",
    "environment": "sandbox",
    "profile_country": "US"
  }'

echo ""
echo "✅ Test event sent! Check your Telegram for the notification."
