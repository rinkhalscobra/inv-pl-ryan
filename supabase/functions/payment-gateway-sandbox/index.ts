import { createClient } from 'npm:@supabase/supabase-js@2.39.0';

const SANDBOX_API_KEY = 'sandbox_evekAlmRh16puingi5kxe3Xbmp6k7nUF8hSlPunB67f386a0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-API-Key',
};

interface PaymentInitiateRequest {
  amount: number;
  currency: string;
  referenceNo: string;
  returnUrl: string;
  email: string;
  billingFirstName: string;
  billingLastName: string;
  billingAddress1: string;
  billingAddress2?: string;
  billingCity: string;
  billingState: string;
  billingPostcode: string;
  billingCountry: string;
  billingPhone: string;
  shippingFirstName?: string;
  shippingLastName?: string;
  shippingAddress1?: string;
  shippingAddress2?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingPostalCode?: string;
  shippingCountry?: string;
  shippingEmail?: string;
  shippingPhone?: string;
}

interface PaymentRequest {
  number: string;
  expiryMonth: number;
  expiryYear: string | number;
  cvv: string;
  referenceNo: string;
  returnUrl: string;
  amount: number;
  currency: string;
  email: string;
  ip?: string;
  birthday?: string;
  billingFirstName: string;
  billingLastName: string;
  billingAddress1: string;
  billingAddress2?: string;
  billingCity: string;
  billingState: string;
  billingPostcode: string;
  billingCountry: string;
  billingPhone: string;
  shippingFirstName?: string;
  shippingLastName?: string;
  shippingAddress1?: string;
  shippingAddress2?: string;
  shippingCity?: string;
  shippingState?: string;
  shippingPostalCode?: string;
  shippingCountry?: string;
  shippingEmail?: string;
  shippingPhone?: string;
}

function validateApiKey(req: Request): boolean {
  const apiKey = req.headers.get('X-API-Key');
  return apiKey === SANDBOX_API_KEY;
}

function maskCardNumber(cardNumber: string): string {
  if (cardNumber.length < 10) return '******';
  return cardNumber.substring(0, 6) + '******' + cardNumber.substring(cardNumber.length - 4);
}

function determineCardBehavior(cardNumber: string): { requires3ds: boolean; status: string } {
  if (cardNumber === '4000000000000002') {
    return { requires3ds: false, status: 'DECLINED' };
  }
  if (cardNumber === '4000000000003220') {
    return { requires3ds: true, status: 'WAITING' };
  }
  return { requires3ds: false, status: 'APPROVED' };
}

function generateCheckoutToken(transactionUuid: string): string {
  const data = JSON.stringify({ uuid: transactionUuid, timestamp: Date.now() });
  return btoa(data).replace(/=/g, '');
}

function generateHmacSignature(payload: any, secret: string): Promise<string> {
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
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(jsonPayload);
  
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  ).then(key => 
    crypto.subtle.sign('HMAC', key, messageData)
  ).then(signature => 
    Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

async function sendWebhook(transaction: any, supabaseClient: any) {
  if (!transaction.webhook_url) return;

  const requestId = crypto.randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);
  
  const webhookPayload = {
    uuid: transaction.transaction_uuid,
    referenceNo: transaction.reference_no,
    returnUrl: transaction.return_url,
    status: transaction.status,
    amount: transaction.amount,
    currency: transaction.currency,
    timestamp,
    requestId,
    transaction: {
      id: transaction.transaction_uuid,
      method: transaction.payment_method,
      cardMasked: transaction.card_number_masked,
    },
    customerInfo: {
      email: transaction.customer_email,
      billing: transaction.billing_info,
      shipping: transaction.shipping_info,
    },
  };

  const signature = await generateHmacSignature(webhookPayload, SANDBOX_API_KEY);

  try {
    const response = await fetch(transaction.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Timestamp': timestamp.toString(),
        'X-Request-ID': requestId,
      },
      body: JSON.stringify(webhookPayload),
    });

    const responseBody = await response.text();
    
    await supabaseClient.from('sandbox_webhook_logs').insert({
      transaction_id: transaction.id,
      webhook_url: transaction.webhook_url,
      payload: webhookPayload,
      signature,
      request_id: requestId,
      timestamp,
      response_status: response.status,
      response_body: responseBody,
      delivered: response.ok,
    });

    await supabaseClient.from('sandbox_payment_transactions')
      .update({
        webhook_delivered: response.ok,
        webhook_attempts: transaction.webhook_attempts + 1,
        webhook_last_attempt: new Date().toISOString(),
      })
      .eq('id', transaction.id);
  } catch (error) {
    console.error('Webhook delivery failed:', error);
    
    await supabaseClient.from('sandbox_webhook_logs').insert({
      transaction_id: transaction.id,
      webhook_url: transaction.webhook_url,
      payload: webhookPayload,
      signature,
      request_id: requestId,
      timestamp,
      response_status: 0,
      response_body: error.message,
      delivered: false,
    });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace('/payment-gateway-sandbox', '');

    if (!validateApiKey(req)) {
      return new Response(
        JSON.stringify({ status: 'ERROR', message: 'Unauthorized - Invalid API Key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ status: 'ERROR', message: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    
    if (parts.length !== 3) {
      return new Response(
        JSON.stringify({ status: 'ERROR', message: 'Invalid token format' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let userId: string;
    try {
      const payload = JSON.parse(atob(parts[1]));
      userId = payload.sub;
      
      if (!userId) {
        throw new Error('No user ID in token');
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ status: 'ERROR', message: 'Invalid token payload' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    if (path === '/v1/initiate' && req.method === 'POST') {
      const body: PaymentInitiateRequest = await req.json();
      
      const transactionUuid = crypto.randomUUID();
      const checkoutToken = generateCheckoutToken(transactionUuid);
      const redirectUrl = `https://sandbox.galiapay.com/checkout?checkoutToken=${checkoutToken}`;

      const { data: transaction, error } = await supabaseClient
        .from('sandbox_payment_transactions')
        .insert({
          transaction_uuid: transactionUuid,
          user_id: userId,
          reference_no: body.referenceNo,
          amount: body.amount,
          currency: body.currency,
          status: 'PENDING',
          payment_method: 'hosted',
          return_url: body.returnUrl,
          redirect_url: redirectUrl,
          customer_email: body.email,
          billing_info: {
            firstName: body.billingFirstName,
            lastName: body.billingLastName,
            address1: body.billingAddress1,
            address2: body.billingAddress2,
            city: body.billingCity,
            state: body.billingState,
            postcode: body.billingPostcode,
            country: body.billingCountry,
            phone: body.billingPhone,
          },
          shipping_info: body.shippingFirstName ? {
            firstName: body.shippingFirstName,
            lastName: body.shippingLastName,
            address1: body.shippingAddress1,
            address2: body.shippingAddress2,
            city: body.shippingCity,
            state: body.shippingState,
            postalCode: body.shippingPostalCode,
            country: body.shippingCountry,
            email: body.shippingEmail,
            phone: body.shippingPhone,
          } : {},
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({
          uuid: transactionUuid,
          referenceNo: body.referenceNo,
          returnUrl: body.returnUrl,
          status: 'PENDING',
          amount: body.amount,
          currency: body.currency,
          redirectUrl,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (path === '/v1/payment' && req.method === 'POST') {
      const body: PaymentRequest = await req.json();
      
      const cardBehavior = determineCardBehavior(body.number);
      const transactionUuid = crypto.randomUUID();
      const maskedCard = maskCardNumber(body.number);

      let redirectUrl = null;
      if (cardBehavior.requires3ds) {
        const secureToken = generateCheckoutToken(transactionUuid);
        redirectUrl = `https://sandbox.galiapay.com/3d/secure?token=${secureToken}`;
      }

      const { data: transaction, error } = await supabaseClient
        .from('sandbox_payment_transactions')
        .insert({
          transaction_uuid: transactionUuid,
          user_id: userId,
          reference_no: body.referenceNo,
          amount: body.amount,
          currency: body.currency,
          status: cardBehavior.status,
          payment_method: 'card',
          card_number_masked: maskedCard,
          return_url: body.returnUrl,
          redirect_url: redirectUrl,
          requires_3ds: cardBehavior.requires3ds,
          customer_email: body.email,
          customer_ip: body.ip,
          customer_birthday: body.birthday,
          billing_info: {
            firstName: body.billingFirstName,
            lastName: body.billingLastName,
            address1: body.billingAddress1,
            address2: body.billingAddress2,
            city: body.billingCity,
            state: body.billingState,
            postcode: body.billingPostcode,
            country: body.billingCountry,
            phone: body.billingPhone,
          },
          shipping_info: body.shippingFirstName ? {
            firstName: body.shippingFirstName,
            lastName: body.shippingLastName,
            address1: body.shippingAddress1,
            address2: body.shippingAddress2,
            city: body.shippingCity,
            state: body.shippingState,
            postalCode: body.shippingPostalCode,
            country: body.shippingCountry,
            email: body.shippingEmail,
            phone: body.shippingPhone,
          } : {},
          error_message: cardBehavior.status === 'DECLINED' ? 'Card declined by issuer' : null,
        })
        .select()
        .single();

      if (error) throw error;

      if (cardBehavior.status === 'APPROVED') {
        const amountInUSD = body.amount / 100;

        await supabaseClient.from('transactions').insert({
          user_id: userId,
          type: 'deposit',
          amount: amountInUSD,
          status: 'completed',
          description: `Sandbox payment deposit - ${body.referenceNo} (${body.currency})`,
        });

        const { data: currentBalance } = await supabaseClient
          .from('balance')
          .select('demo_balance')
          .eq('user_id', userId)
          .single();

        if (currentBalance) {
          await supabaseClient
            .from('balance')
            .update({ demo_balance: currentBalance.demo_balance + amountInUSD })
            .eq('user_id', userId);
        } else {
          await supabaseClient
            .from('balance')
            .insert({ user_id: userId, demo_balance: amountInUSD, real_balance: 0 });
        }

        setTimeout(() => sendWebhook(transaction, supabaseClient), 1000);
      }

      const response: any = {
        uuid: transactionUuid,
        amount: body.amount.toString(),
        currency: body.currency,
        status: cardBehavior.status,
        referenceNo: body.referenceNo,
        returnUrl: body.returnUrl,
        isLive: false,
      };

      if (cardBehavior.requires3ds) {
        response.message = '3D Secure required';
        response.redirectUrl = redirectUrl;
        response['3d'] = true;
      } else if (cardBehavior.status === 'DECLINED') {
        response.message = 'Card declined by issuer';
      }

      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (path === '/v1/payment/status' && req.method === 'GET') {
      const body = await req.json();
      const { uuid } = body;

      if (!uuid) {
        return new Response(
          JSON.stringify({ status: 'ERROR', message: 'UUID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: transaction, error } = await supabaseClient
        .from('sandbox_payment_transactions')
        .select('*')
        .eq('transaction_uuid', uuid)
        .eq('user_id', userId)
        .single();

      if (error || !transaction) {
        return new Response(
          JSON.stringify({ status: 'ERROR', message: 'Not found.' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          uuid: transaction.transaction_uuid,
          referenceNo: transaction.reference_no,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          returnUrl: transaction.return_url,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (path === '/v1/allowed-cards' && req.method === 'GET') {
      const { data: cards, error } = await supabaseClient
        .from('sandbox_allowed_cards')
        .select('first_six, last_four, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(
        JSON.stringify(cards || []),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (path === '/v1/allowed-cards' && req.method === 'POST') {
      const body = await req.json();
      const { first_six, last_four } = body;

      if (!first_six || !last_four) {
        return new Response(
          JSON.stringify({ status: 'ERROR', message: 'first_six and last_four are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: card, error } = await supabaseClient
        .from('sandbox_allowed_cards')
        .insert({ user_id: userId, first_six, last_four })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({
          message: 'Allowed card added successfully',
          allowed_card: card,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (path === '/v1/allowed-cards/search' && req.method === 'GET') {
      const body = await req.json();
      const { first_six, last_four } = body;

      let query = supabaseClient.from('sandbox_allowed_cards').select('*').eq('user_id', userId);

      if (first_six) query = query.eq('first_six', first_six);
      if (last_four) query = query.eq('last_four', last_four);

      const { data: cards, error } = await query;

      if (error) throw error;

      return new Response(
        JSON.stringify(cards || []),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (path === '/v1/allowed-cards' && req.method === 'DELETE') {
      const body = await req.json();
      const { first_six, last_four } = body;

      if (!first_six || !last_four) {
        return new Response(
          JSON.stringify({ status: 'ERROR', message: 'first_six and last_four are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabaseClient
        .from('sandbox_allowed_cards')
        .delete()
        .eq('user_id', userId)
        .eq('first_six', first_six)
        .eq('last_four', last_four);

      if (error) {
        return new Response(
          JSON.stringify({ status: 'ERROR', message: 'Allowed card not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ message: 'Allowed card deleted successfully' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (path === '/v1/allowed-cards/all' && req.method === 'DELETE') {
      const { data: cards, error: fetchError } = await supabaseClient
        .from('sandbox_allowed_cards')
        .select('id')
        .eq('user_id', userId);

      const count = cards?.length || 0;

      if (count > 0) {
        const { error: deleteError } = await supabaseClient
          .from('sandbox_allowed_cards')
          .delete()
          .eq('user_id', userId);

        if (deleteError) throw deleteError;
      }

      return new Response(
        JSON.stringify({
          message: `Deleted ${count} allowed card(s)`,
          deleted_count: count,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ status: 'ERROR', message: 'Endpoint not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ status: 'ERROR', message: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});