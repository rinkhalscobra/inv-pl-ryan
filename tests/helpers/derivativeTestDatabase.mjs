import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const id = n => `93000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const company = id(1), otherCompany = id(2), client = id(3), otherClient = id(4), admin = id(5), referrer = id(6);
export const migration = name => readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
export function sqlFunction(sql, name) {
  const start = sql.search(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION ${name.replaceAll('.', '\\.')}\\(`));
  assert.ok(start >= 0, `Missing ${name}`);
  return sql.slice(start, sql.indexOf('$$;', start) + 3);
}

export async function derivativeDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA crm_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    GRANT USAGE ON SCHEMA public,auth,crm_private TO authenticated;
    CREATE TABLE public.users(id uuid PRIMARY KEY,company_id uuid,is_admin boolean DEFAULT false,
      referred_by uuid,referral_count integer DEFAULT 0,referral_commission_rate numeric DEFAULT 0.01,
      total_referral_earnings numeric DEFAULT 0,updated_at timestamptz DEFAULT now(),
      min_leverage_futures integer DEFAULT 1,max_leverage_futures integer DEFAULT 100,
      min_leverage_forex integer DEFAULT 1,max_leverage_forex integer DEFAULT 100,
      min_leverage_commodities integer DEFAULT 1,max_leverage_commodities integer DEFAULT 50,
      min_leverage_stocks integer DEFAULT 1,max_leverage_stocks integer DEFAULT 20);
    INSERT INTO public.users(id,company_id,is_admin) VALUES('${client}','${company}',false),('${otherClient}','${otherCompany}',false),
      ('${admin}','${company}',true),('${referrer}','${company}',false);
    CREATE TABLE public.crm_staff_roles(user_id uuid,role text);
    CREATE TABLE crm_private.admin_ip_allowlist(address inet,access_scope text,company_id uuid);
    INSERT INTO crm_private.admin_ip_allowlist VALUES('192.0.2.1','company','${company}');
    CREATE TABLE public.balances(user_id uuid PRIMARY KEY,usdt_balance numeric NOT NULL DEFAULT 0,updated_at timestamptz DEFAULT now());
    INSERT INTO public.balances(user_id,usdt_balance) VALUES('${client}',2000),('${otherClient}',5000),('${referrer}',0);
    CREATE TABLE public.market_data(symbol text PRIMARY KEY,price numeric,timestamp timestamptz,updated_at timestamptz DEFAULT now());
    CREATE TABLE public.crypto_market_quotes(symbol text PRIMARY KEY,price numeric,timestamp timestamptz);
    CREATE TABLE public.cfd_market_quotes(LIKE public.crypto_market_quotes INCLUDING ALL);
    INSERT INTO public.crypto_market_quotes VALUES('BTCUSDT',50000,now());
    INSERT INTO public.cfd_market_quotes VALUES('EUR/USD',1.1,now()),('USD/JPY',150,now()),('EUR/GBP',0.88,now()),('GBP/USD',1.25,now()),('XAU/USD',2300,now()),('AAPL',200,now());
    INSERT INTO public.market_data SELECT symbol,price,timestamp,now() FROM public.crypto_market_quotes;
    INSERT INTO public.market_data SELECT symbol,price,timestamp,now() FROM public.cfd_market_quotes;
    CREATE TABLE public.instrument_spreads(symbol text PRIMARY KEY,instrument_type text,is_active boolean DEFAULT true,
      spread_percentage numeric DEFAULT 0.0001,min_spread_value numeric DEFAULT 0,max_spread_value numeric DEFAULT 999999);
    INSERT INTO public.instrument_spreads(symbol,instrument_type,spread_percentage,min_spread_value,max_spread_value) VALUES
      ('BTCUSDT','crypto',0.00005,0.5,2),('EUR/USD','forex',0.00006,0.00006,0.0001),
      ('USD/JPY','forex',0.00007,0.007,0.01),('EUR/GBP','forex',0.00009,0.00009,0.00012),
      ('XAU/USD','commodity',0.00015,0.2,0.5),('AAPL','stock',0.0001,0.01,0.03);
    CREATE TABLE public.futures_positions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES public.users(id),
      symbol text,side text,entry_price numeric,current_price numeric,amount numeric,leverage integer,margin_type text,
      liquidation_price numeric,unrealized_pnl numeric,margin numeric,roi numeric,is_open boolean,position_size numeric,
      tp_price numeric,sl_price numeric,spread_cost numeric DEFAULT 0,spread_percentage numeric DEFAULT 0,
      maintenance_margin_rate numeric DEFAULT 0.005,swap_accrued_at timestamptz DEFAULT now(),
      accumulated_swap_cost numeric DEFAULT 0,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE public.futures_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,
      symbol text,type text,side text,price numeric,amount numeric,leverage integer,margin_type text,
      status text,tp_price numeric,sl_price numeric,reserved_margin numeric,created_at timestamptz DEFAULT now(),filled_at timestamptz,position_id uuid);
    CREATE TABLE public.futures_position_history(id uuid PRIMARY KEY,user_id uuid,symbol text,side text,entry_price numeric,exit_price numeric,
      amount numeric,leverage integer,margin numeric,pnl numeric,roi numeric,open_time timestamptz,close_time timestamptz,duration_seconds integer,
      spread_cost numeric,spread_percentage numeric,accumulated_swap_cost numeric,total_swap_days integer);
    CREATE TABLE public.referral_earnings(id uuid DEFAULT gen_random_uuid(),referrer_id uuid,referred_user_id uuid,position_id uuid,
      commission_amount numeric,position_pnl numeric,position_symbol text,position_side text,created_at timestamptz DEFAULT now());
    CREATE TABLE public.transactions(id uuid DEFAULT gen_random_uuid(),user_id uuid,type text,amount numeric,currency text,description text,status text);
    CREATE TABLE public.admin_action_logs(admin_user_id uuid,target_user_id uuid,company_id uuid,action text,after_data jsonb,reason text);
  `);
  const tenancy = await migration('20260925120000_add_crm_company_tenancy');
  for (const name of ['crm_private.request_ip', 'crm_private.request_network_context']) await db.exec(sqlFunction(tenancy, name));
  const scopes = await migration('20261014140000_allow_company_admins_to_manage_kyc');
  for (const name of ['public.require_admin', 'crm_private.admin_can_manage_user', 'crm_private.assert_actor_user_access']) await db.exec(sqlFunction(scopes, name));
  const pricing = await migration('20260911163000_fix_realtime_derivatives_accounting');
  for (const name of ['derivative_usd_per_currency','derivative_swap_rate','calculate_derivative_notional_usd','calculate_derivative_pnl_usd','calculate_derivative_spread_cost_usd']) {
    await db.exec(sqlFunction(pricing, `public.${name}`));
  }
  const engine = await migration('20260917120000_rebuild_futures_engine');
  for (const name of ['futures_liquidation_price','place_derivative_order','cancel_futures_order','cancel_all_futures_orders','update_futures_risk','close_futures_position','process_futures_engine']) {
    await db.exec(sqlFunction(engine, `public.${name}`));
  }
  await db.exec(await migration('20261116230000_add_crm_client_position_opening'));
  await db.exec(sqlFunction(await migration('20261028160000_edit_crm_module_statuses'), 'public.admin_update_module_record'));
  await db.exec(await migration('20261117160000_unify_derivative_position_valuation'));
  return db;
}
