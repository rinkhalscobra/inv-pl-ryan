import { createClient } from 'npm:@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const respond = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const authorization = request.headers.get('Authorization') || '';
    if (!supabaseUrl || !serviceRoleKey) return respond({ error: 'Server configuration is incomplete' }, 500);
    if (authorization !== `Bearer ${serviceRoleKey}`) return respond({ error: 'Service authorization required' }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: positions, error: positionsError } = await admin
      .from('futures_positions')
      .select('id,user_id,symbol,current_price,amount,leverage')
      .eq('is_open', true);
    if (positionsError) throw positionsError;

    let processed = 0;
    let totalSwapCharged = 0;
    const errors: Array<{ positionId: string; error: string }> = [];

    for (const position of positions || []) {
      const { data: charged, error: chargeError } = await admin.rpc('accrue_position_swap', {
        p_position_id: position.id
      });
      if (chargeError) {
        errors.push({ positionId: position.id, error: chargeError.message });
        continue;
      }

      const amount = Number(charged) || 0;
      if (amount > 0) {
        const positionSize = Number(position.amount) * Number(position.current_price);
        await admin.from('position_swap_charges').insert({
          position_id: position.id,
          user_id: position.user_id,
          symbol: position.symbol,
          swap_amount: amount,
          position_size: positionSize,
          leverage: position.leverage || 1,
          swap_rate: positionSize > 0 ? amount / positionSize : 0,
          charge_date: new Date().toISOString().slice(0, 10)
        });
        processed += 1;
        totalSwapCharged += amount;
      }
    }

    return respond({
      success: errors.length === 0,
      totalPositions: positions?.length || 0,
      processed,
      totalSwapCharged,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Swap accrual failed', error);
    return respond({ error: error instanceof Error ? error.message : 'Swap accrual failed' }, 500);
  }
});
