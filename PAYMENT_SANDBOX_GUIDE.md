# Payment Gateway Sandbox Guide

## Overview

The Payment Gateway Sandbox is a complete testing environment that simulates the GaliaPay payment API. It allows you to test payment integrations without processing real transactions or using actual payment credentials.

## Features

- **Complete API Implementation**: All endpoints from the GaliaPay API documentation
- **Test Card Numbers**: Predefined cards for different payment scenarios
- **Webhook Simulation**: Automatic webhook delivery with HMAC-SHA256 signatures
- **Transaction History**: View all sandbox transactions in real-time
- **Webhook Logs**: Debug webhook delivery with detailed logs
- **Card Whitelist**: Manage allowed cards using BIN/last-four system

## Accessing the Sandbox

1. Log into your account
2. Click on your profile icon in the top right
3. Select "Payment Sandbox" from the dropdown menu

## API Credentials

**Sandbox API Key**: `sandbox_evekAlmRh16puingi5kxe3Xbmp6k7nUF8hSlPunB67f386a0`

**Base URL**: `https://[your-supabase-url]/functions/v1/payment-gateway-sandbox`

## Test Card Numbers

Use these card numbers to simulate different payment scenarios:

| Card Number | Behavior | Status |
|------------|----------|---------|
| `4012888888881881` | Payment succeeds immediately | APPROVED |
| `4000000000000002` | Payment is declined | DECLINED |
| `4000000000003220` | Requires 3D Secure authentication | WAITING (3DS) |

**Default Card Details for Testing**:
- Expiry: Any future date (e.g., 12/2025)
- CVV: Any 3 digits (e.g., 123)

## API Endpoints

### 1. POST /v1/initiate

Initialize a hosted payment checkout session.

**Request Body**:
```json
{
  "amount": 5000,
  "currency": "USD",
  "referenceNo": "ORD-2025-12345",
  "returnUrl": "https://example.com/payment/callback",
  "email": "customer@example.com",
  "billingFirstName": "John",
  "billingLastName": "Doe",
  "billingAddress1": "123 Main Street",
  "billingCity": "New York",
  "billingState": "NY",
  "billingPostcode": "10001",
  "billingCountry": "US",
  "billingPhone": "+1-555-123-4567"
}
```

**Response**:
```json
{
  "uuid": "b15401ba-3f5b-4fee-a9e8-21e7fd2d26e4",
  "referenceNo": "ORD-2025-12345",
  "returnUrl": "https://example.com/payment/callback",
  "status": "PENDING",
  "amount": 5000,
  "currency": "USD",
  "redirectUrl": "https://sandbox.galiapay.com/checkout?checkoutToken=..."
}
```

### 2. POST /v1/payment

Process a direct card payment.

**Request Body**:
```json
{
  "number": "4012888888881881",
  "expiryMonth": 12,
  "expiryYear": 2025,
  "cvv": "123",
  "referenceNo": "REF-12345",
  "returnUrl": "https://example.com/return",
  "amount": 5000,
  "currency": "USD",
  "email": "customer@example.com",
  "billingFirstName": "John",
  "billingLastName": "Doe",
  "billingAddress1": "123 Main Street",
  "billingCity": "New York",
  "billingState": "NY",
  "billingPostcode": "10001",
  "billingCountry": "US",
  "billingPhone": "+1-555-123-4567"
}
```

**Response (Success)**:
```json
{
  "uuid": "52db0d21-f681-45e8-ac91-d20342c5cc45",
  "amount": "5000",
  "currency": "USD",
  "status": "APPROVED",
  "referenceNo": "REF-12345",
  "returnUrl": "https://example.com/return",
  "isLive": false
}
```

**Response (3D Secure Required)**:
```json
{
  "uuid": "52db0d21-f681-45e8-ac91-d20342c5cc45",
  "amount": "5000",
  "currency": "USD",
  "status": "WAITING",
  "referenceNo": "REF-12345",
  "returnUrl": "https://example.com/return",
  "message": "3D Secure required",
  "isLive": false,
  "redirectUrl": "https://sandbox.galiapay.com/3d/secure?token=...",
  "3d": true
}
```

### 3. GET /v1/payment/status

Check the status of a transaction by UUID.

**Request Body**:
```json
{
  "uuid": "6ff8f7f6-1eb3-3525-be4a-3932c805afed"
}
```

**Response**:
```json
{
  "uuid": "6ff8f7f6-1eb3-3525-be4a-3932c805afed",
  "referenceNo": "REF-12345",
  "status": "APPROVED",
  "amount": 5000,
  "currency": "USD",
  "returnUrl": "https://example.com/return"
}
```

### 4. GET /v1/allowed-cards

Retrieve all allowed cards for your account.

**Response**:
```json
[
  {
    "first_six": "401288",
    "last_four": "1881",
    "created_at": "2025-11-04T11:51:34.000000Z",
    "updated_at": "2025-11-04T11:51:34.000000Z"
  }
]
```

### 5. POST /v1/allowed-cards

Add a card to the whitelist.

**Request Body**:
```json
{
  "first_six": "401288",
  "last_four": "1881"
}
```

### 6. DELETE /v1/allowed-cards

Remove a specific card from the whitelist.

**Request Body**:
```json
{
  "first_six": "401288",
  "last_four": "1881"
}
```

### 7. DELETE /v1/allowed-cards/all

Remove all cards from the whitelist.

## Webhook Notifications (IPN)

When a payment is successfully processed, the sandbox automatically sends a webhook notification to simulate the IPN (Instant Payment Notification) system.

### Webhook Payload

```json
{
  "uuid": "transaction-uuid",
  "referenceNo": "REF123",
  "returnUrl": "https://example.com/return",
  "status": "APPROVED",
  "amount": 10000,
  "currency": "USD",
  "timestamp": 1234567890,
  "requestId": "018e1234-5678-7abc-def0-123456789abc",
  "transaction": {
    "id": "transaction-uuid",
    "method": "card",
    "cardMasked": "401288******1881"
  },
  "customerInfo": {
    "email": "customer@example.com",
    "billing": { ... },
    "shipping": { ... }
  }
}
```

### Webhook Headers

- **X-Signature**: HMAC-SHA256 signature of the payload
- **X-Timestamp**: Unix timestamp when webhook was sent
- **X-Request-ID**: Unique UUID v7 for tracking

### Signature Verification

The webhook signature is calculated using HMAC-SHA256 with specific fields from the payload:

**Fields Used** (in alphabetical order):
- amount
- currency
- referenceNo
- requestId
- returnUrl
- status
- timestamp
- uuid

**JavaScript Example**:
```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, apiKey) {
  const signaturePayload = {
    amount: payload.amount,
    currency: payload.currency,
    referenceNo: payload.referenceNo,
    requestId: payload.requestId,
    returnUrl: payload.returnUrl,
    status: payload.status,
    timestamp: payload.timestamp,
    uuid: payload.uuid,
  };

  const jsonPayload = JSON.stringify(signaturePayload);
  const expectedSignature = crypto
    .createHmac('sha256', apiKey)
    .update(jsonPayload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

**Python Example**:
```python
import hmac
import hashlib
import json

def verify_webhook_signature(payload, signature, api_key):
    signature_payload = {
        'amount': payload['amount'],
        'currency': payload['currency'],
        'referenceNo': payload['referenceNo'],
        'requestId': payload['requestId'],
        'returnUrl': payload['returnUrl'],
        'status': payload['status'],
        'timestamp': payload['timestamp'],
        'uuid': payload['uuid'],
    }

    json_payload = json.dumps(signature_payload, separators=(',', ':'))
    expected_signature = hmac.new(
        api_key.encode(),
        json_payload.encode(),
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(signature, expected_signature)
```

## cURL Examples

### Initiate Payment
```bash
curl -X POST https://[your-url]/functions/v1/payment-gateway-sandbox/v1/initiate \
  -H "Authorization: Bearer sandbox_evekAlmRh16puingi5kxe3Xbmp6k7nUF8hSlPunB67f386a0" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000,
    "currency": "USD",
    "referenceNo": "ORD-2025-12345",
    "returnUrl": "https://example.com/callback",
    "email": "customer@example.com",
    "billingFirstName": "John",
    "billingLastName": "Doe",
    "billingAddress1": "123 Main Street",
    "billingCity": "New York",
    "billingState": "NY",
    "billingPostcode": "10001",
    "billingCountry": "US",
    "billingPhone": "+1-555-123-4567"
  }'
```

### Process Payment
```bash
curl -X POST https://[your-url]/functions/v1/payment-gateway-sandbox/v1/payment \
  -H "Authorization: Bearer sandbox_evekAlmRh16puingi5kxe3Xbmp6k7nUF8hSlPunB67f386a0" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "4012888888881881",
    "expiryMonth": 12,
    "expiryYear": 2025,
    "cvv": "123",
    "referenceNo": "REF-12345",
    "returnUrl": "https://example.com/return",
    "amount": 5000,
    "currency": "USD",
    "email": "customer@example.com",
    "billingFirstName": "John",
    "billingLastName": "Doe",
    "billingAddress1": "123 Main Street",
    "billingCity": "New York",
    "billingState": "NY",
    "billingPostcode": "10001",
    "billingCountry": "US",
    "billingPhone": "+1-555-123-4567"
  }'
```

## Testing Workflow

1. **Test Payment Initiation**:
   - Navigate to the "Initiate" tab
   - Fill in the form with test data
   - Click "Initiate Payment"
   - Copy the returned UUID and redirectUrl

2. **Test Direct Payment**:
   - Go to the "Payment" tab
   - Use one of the test card numbers
   - Fill in the required fields
   - Click "Process Payment"
   - Check the response for status and any redirect URLs

3. **Check Transaction Status**:
   - Copy a transaction UUID from previous tests
   - Go to the "Status" tab
   - Paste the UUID
   - Click "Check Status"

4. **View Transaction History**:
   - Click on the "Transactions" tab
   - See all your sandbox transactions with status icons
   - View transaction details including amounts and timestamps

5. **Monitor Webhooks**:
   - Click on the "Webhooks" tab
   - See webhook delivery attempts
   - Check signatures and response codes
   - Debug webhook integration issues

6. **Manage Allowed Cards**:
   - Go to the "Cards" tab
   - Add cards to your whitelist using BIN and last 4 digits
   - View and delete allowed cards

## Best Practices

1. **Test All Scenarios**: Use all three test card numbers to verify your integration handles success, failure, and 3DS flows.

2. **Verify Webhooks**: Always implement webhook signature verification in production code.

3. **Handle Errors**: Test how your application handles declined payments and network errors.

4. **Validate Timing**: Check that your system properly handles the timestamp validation (reject webhooks older than 5 minutes).

5. **Monitor Logs**: Use the webhook logs to debug integration issues before going live.

6. **Use Reference Numbers**: Always include unique reference numbers to track transactions in your system.

## Security Notes

- The sandbox uses the same security mechanisms as production (HMAC-SHA256)
- All transactions are stored in a separate database table
- Webhook signatures must be verified using timing-safe comparison
- The sandbox API key should still be treated as confidential
- No real payment processing occurs in sandbox mode

## Limitations

- Sandbox transactions do not affect real accounts or balances
- Webhook delivery happens within the same infrastructure (no external calls)
- 3D Secure redirects are simulated URLs only
- Maximum 20 transactions visible in the UI (all stored in database)
- Webhook retries are not implemented (single delivery attempt)

## Troubleshooting

**Issue**: "Unauthorized" error
- **Solution**: Verify you're using the correct API key in the Authorization header

**Issue**: Webhook not received
- **Solution**: Check the webhook logs tab to see delivery attempts and response codes

**Issue**: Signature verification fails
- **Solution**: Ensure you're using exactly the fields specified in the documentation, in alphabetical order

**Issue**: Transaction not found
- **Solution**: Verify the UUID is correct and the transaction was created successfully

## Support

For questions or issues with the sandbox:
1. Check the transaction and webhook logs for detailed error information
2. Verify all required fields are included in your requests
3. Test with the provided example requests in the UI
4. Review this documentation for API specifications

## Next Steps

After successfully testing in the sandbox:
1. Update your API endpoint to the production URL
2. Replace the sandbox API key with your production key
3. Implement proper error handling and logging
4. Set up monitoring for webhook delivery
5. Test with small amounts before processing larger transactions
