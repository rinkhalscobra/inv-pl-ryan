import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { derivativeDatabase, client, otherClient, admin, referrer } from './helpers/derivativeTestDatabase.mjs';
import { positionSizeForMargin, sumPositionPnl } from '../src/lib/positionValuation.ts';

let db;
before(async () => { db = await derivativeDatabase(); });
beforeEach(async () => { await db.exec('BEGIN'); await login(client,'service_role'); });
afterEach(async () => { await db.exec('ROLLBACK'); });
after(async () => { await db?.close(); });
const approx = (value, expected, tolerance = 1e-7) => assert.ok(Math.abs(Number(value)-expected) < tolerance, `${value} must equal ${expected}`);
async function login(user = client, role = 'authenticated') {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false),set_config('request.headers','{\"cf-connecting-ip\":\"192.0.2.1\"}',false)", [user || '',role]);
}
async function rejects(fn, expected) {
  await db.exec('SAVEPOINT expected_error');
  try { await assert.rejects(fn,expected); }
  finally { await db.exec('ROLLBACK TO SAVEPOINT expected_error; RELEASE SAVEPOINT expected_error'); }
}
async function quote(symbol, price, age = '0 seconds') {
  await db.query(`UPDATE public.${symbol.endsWith('USDT')?'crypto':'cfd'}_market_quotes SET price=$2,timestamp=now()-$3::interval WHERE symbol=$1`, [symbol,price,age]);
}
async function open({ symbol='BTCUSDT',side='long',amount=0.01,leverage=10,mode='isolated',type='market',limit=null,sl=null,tp=null,user=client }={}) {
  return (await db.query('SELECT public.place_derivative_order($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10) AS result', [user,symbol,side,amount,leverage,mode,type,limit,sl,tp])).rows[0].result;
}
async function values(user=client) {
  await login(user);
  return (await db.query('SELECT public.get_my_derivative_positions() AS result')).rows[0].result;
}
const wallet = async (user=client) => Number((await db.query('SELECT usdt_balance FROM public.balances WHERE user_id=$1',[user])).rows[0].usdt_balance);
async function processEngine() { await login(null,'service_role'); return (await db.query('SELECT public.process_futures_engine() AS result')).rows[0].result; }

test('opening books both spread legs in net P&L while reserving margin without debiting cash', async () => {
  const result = await open();
  const [position] = await values();
  approx(position.entry_price,50000); approx(position.margin,50);
  approx(position.gross_unrealized_pnl,0); approx(position.spread_cost,0.5);
  approx(position.estimated_exit_spread_cost,0.5); approx(position.unrealized_pnl,-1); approx(position.roi,-2);
  approx(await wallet(),2000);
  const stored = (await db.query('SELECT unrealized_pnl FROM public.futures_positions WHERE id=$1',[result.id])).rows[0];
  approx(stored.unrealized_pnl,position.unrealized_pnl);
});

for (const [symbol,amount,entry,mark,longGross] of [
  ['BTCUSDT',0.01,50000,51000,10],['EUR/USD',1000,1.1,1.11,10],
  ['USD/JPY',1000,150,151,1000/151],['EUR/GBP',1000,0.88,0.89,12.5],
  ['XAU/USD',1,2300,2310,10],['AAPL',10,200,201,10],
]) for (const side of ['long','short']) {
  test(`${symbol} ${side}: current quote, currency conversion, fees, ROI and closing ledger agree`, async () => {
    const result = await open({ symbol,side,amount });
    await quote(symbol,mark);
    const [position] = await values();
    approx(position.gross_unrealized_pnl,side==='long'?longGross:-longGross);
    approx(position.unrealized_pnl,Number(position.gross_unrealized_pnl)-Number(position.entry_spread_cost)-Number(position.estimated_exit_spread_cost));
    approx(position.roi,Number(position.unrealized_pnl)/Number(position.margin)*100);
    approx(sumPositionPnl([position]),Number(position.unrealized_pnl));
    const before = await wallet();
    const settled = Number((await db.query('SELECT public.close_futures_position($1,$2) AS pnl',[result.id,mark])).rows[0].pnl);
    approx(settled,Number(position.unrealized_pnl)); approx(await wallet()-before,settled);
    const history = (await db.query('SELECT * FROM public.futures_position_history WHERE id=$1',[result.id])).rows[0];
    approx(history.pnl,settled); approx(history.exit_price,mark);
    await rejects(() => db.query('SELECT public.close_futures_position($1,$2)',[result.id,mark]),/Open position not found/);
    approx(await wallet(),before+settled);
  });
}

test('leverage changes collateral and ROI, never the same-sized position gross P&L', async () => {
  await open({leverage:10}); await open({leverage:20}); await quote('BTCUSDT',51000);
  const positions=await values();
  approx(positions[0].gross_unrealized_pnl,positions[1].gross_unrealized_pnl);
  const sorted=positions.sort((a,b)=>Number(a.leverage)-Number(b.leverage));
  approx(sorted[0].margin,50); approx(sorted[1].margin,25); approx(sorted[1].roi,Number(sorted[0].roi)*2);
});

test('financing is accrued once from its checkpoint and does not multiply leverage', async () => {
  const result=await open();
  await db.query("UPDATE public.futures_positions SET accumulated_swap_cost=2,swap_accrued_at=now()-interval '12 hours' WHERE id=$1",[result.id]);
  const [position]=await values();
  approx(position.daily_swap_cost,0.15); approx(position.estimated_swap_cost,2.075); approx(position.unrealized_pnl,-3.075);
  await db.query('SELECT public.close_futures_position($1,50000)',[result.id]);
  const history=(await db.query('SELECT accumulated_swap_cost FROM public.futures_position_history WHERE id=$1',[result.id])).rows[0];
  approx(history.accumulated_swap_cost,2.075);
});

test('CRM opening executes the same engine and exposes the position only to the corresponding client', async () => {
  await login(admin);
  const result=(await db.query("SELECT public.crm_open_client_position($1,'cfd','EUR/USD','long',0.01,10,'isolated',$2,'Accounting regression',NULL,NULL) AS result",[client,randomUUID()])).rows[0].result;
  const positions=await values();
  assert.equal(positions[0].id,result.id); approx(positions[0].amount,1000); approx(positions[0].margin,110);
  approx(positions[0].unrealized_pnl,-0.0002);
  assert.deepEqual(await values(otherClient),[]);
});

test('cross losses can exceed initial margin and settlement protects other isolated collateral', async () => {
  await db.query('UPDATE public.balances SET usdt_balance=200 WHERE user_id=$1',[client]);
  const isolated=await open({amount:0.01,mode:'isolated'});
  const cross=await open({amount:0.01,mode:'cross'});
  await quote('BTCUSDT',30000);
  const positions=await values(); const crossValue=positions.find(p=>p.id===cross.id);
  approx(crossValue.unrealized_pnl,-150); assert.ok(Number(crossValue.unrealized_pnl)<-Number(crossValue.margin));
  const pnl=Number((await db.query('SELECT public.close_futures_position($1,30000) AS pnl',[cross.id])).rows[0].pnl);
  approx(pnl,-150); approx(await wallet(),50);
  assert.equal((await db.query('SELECT is_open FROM public.futures_positions WHERE id=$1',[isolated.id])).rows[0].is_open,true);
});

test('profitable referral settlement uses the configured commission and live schema, posting once', async () => {
  await db.query('UPDATE public.users SET referred_by=$2 WHERE id=$1',[client,referrer]);
  const result=await open(); await quote('BTCUSDT',51000); await login(client);
  const pnl=Number((await db.query('SELECT public.close_futures_position($1,51000) AS pnl',[result.id])).rows[0].pnl);
  approx(await wallet(referrer),pnl*0.01);
  await login(null,'service_role');
  await db.query("SELECT public.process_referral_commission($1,$2,999999,'FORGED','short')",[client,result.id]);
  approx(await wallet(referrer),pnl*0.01);
  assert.equal((await db.query('SELECT count(*)::int n FROM public.referral_earnings')).rows[0].n,1);
});

test('limit orders reserve once, fill at an improved quote, and release their pending reservation', async () => {
  const order=await open({ type:'limit',limit:49000 });
  approx(await wallet(),2000); assert.deepEqual(await values(),[]);
  await processEngine();
  assert.equal((await db.query('SELECT status FROM public.futures_orders WHERE id=$1',[order.id])).rows[0].status,'open');
  await quote('BTCUSDT',48000); const processed=await processEngine();
  assert.equal(processed.filled,1);
  const [position]=await values(); approx(position.entry_price,48000); approx(position.margin,48);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.futures_orders WHERE status='open'")).rows[0].n,0);
  await processEngine(); assert.equal((await values()).length,1);
});

test('isolated maintenance liquidation runs on the server before collateral is exhausted', async () => {
  const result=await open(); await quote('BTCUSDT',45300);
  const processed=await processEngine(); assert.equal(processed.closed,1);
  const history=(await db.query('SELECT pnl FROM public.futures_position_history WHERE id=$1',[result.id])).rows[0];
  assert.ok(Number(history.pnl)>-50 && Number(history.pnl)<-47);
  assert.equal((await values()).length,0);
});

test('TP and SL close on the server without any browser present', async () => {
  await open({tp:51000}); await quote('BTCUSDT',51001);
  assert.equal((await processEngine()).closed,1);
  await quote('BTCUSDT',50000); await login(client,'service_role');
  await open({sl:49000}); await quote('BTCUSDT',48999);
  assert.equal((await processEngine()).closed,1);
  assert.equal((await values()).length,0);
});

test('quote cache drives valuation and settlement even when the old mirror differs; stale data cannot trade', async () => {
  const result=await open(); await quote('BTCUSDT',51000,'4 minutes');
  const [position]=await values(); approx(position.current_price,51000);
  approx((await db.query('SELECT public.close_futures_position($1,51000) AS pnl',[result.id])).rows[0].pnl,Number(position.unrealized_pnl));
  await quote('BTCUSDT',51000,'7 minutes'); await login(client,'service_role');
  await rejects(()=>open(),/verified live price/);
});

test('commodity leverage uses commodity limits and invalid numeric/risk inputs are rejected', async () => {
  await db.query('UPDATE public.users SET max_leverage_commodities=5,max_leverage_forex=100 WHERE id=$1',[client]);
  await rejects(()=>open({symbol:'XAU/USD',amount:1,leverage:10}),/between 1x and 5x/);
  for (const params of [{side:null},{mode:null},{leverage:null},{amount:'NaN'},{amount:Infinity},{amount:0.000000001},{sl:0},{tp:'NaN'}]) await rejects(()=>open(params),/Invalid order parameters/);
  await rejects(()=>open({amount:0.00002,leverage:100}),/trading costs and maintenance/);
});

test('risk updates enforce owner scope and reject zero, negative and non-finite levels', async () => {
  const result=await open(); await login(otherClient);
  await rejects(()=>db.query('SELECT public.update_futures_risk($1,49000,NULL,true,false)',[result.id]),/Open position not found/);
  await login(client);
  for (const price of [0,-1,'NaN','Infinity']) await rejects(()=>db.query('SELECT public.update_futures_risk($1,$2,NULL,true,false)',[result.id,price]),/valid stop-loss/);
});

test('client retries are idempotent after a quote moves and cannot reuse another client or changed order', async () => {
  const key=randomUUID();
  const place=(user=client,amount=0.01)=>db.query("SELECT public.place_client_derivative_order($1,'BTCUSDT','long',$2,10,'isolated','market',50000,NULL,NULL,NULL,$3) AS result",[user,amount,key]);
  const first=(await place()).rows[0].result;
  await quote('BTCUSDT',51000);
  assert.deepEqual((await place()).rows[0].result,first);
  assert.equal((await db.query('SELECT count(*)::int n FROM public.futures_positions')).rows[0].n,1);
  await rejects(()=>place(client,0.02),/different order/);
  await rejects(()=>place(otherClient),/different order/);
  await login(client);
  await rejects(()=>place(),/Service role required/);
});

test('isolated drawdown after an administrative balance reduction never posts more loss than the wallet debit', async () => {
  const result=await open();
  await db.query('UPDATE public.balances SET usdt_balance=10 WHERE user_id=$1',[client]);
  await quote('BTCUSDT',10000); await login(client);
  const [position]=await values(); approx(position.unrealized_pnl,-10);
  const pnl=Number((await db.query('SELECT public.close_futures_position($1,10000) AS pnl',[result.id])).rows[0].pnl);
  approx(pnl,-10); approx(await wallet(),0);
});

test('cross maintenance closes at account-level collateral rather than the initial position margin', async () => {
  await db.query('UPDATE public.balances SET usdt_balance=200 WHERE user_id=$1',[client]);
  await open({mode:'cross'}); await quote('BTCUSDT',40000);
  assert.equal((await processEngine()).closed,0);
  await quote('BTCUSDT',30000); assert.equal((await processEngine()).closed,1);
  assert.equal((await values()).length,0); assert.ok(await wallet()>=0);
});

test('cancelled pending orders release their reservation without adding or removing cash', async () => {
  const order=await open({type:'limit',limit:49000}); await login(client);
  assert.equal((await db.query('SELECT public.cancel_futures_order($1) AS result',[order.id])).rows[0].result,true);
  assert.equal((await db.query('SELECT public.cancel_futures_order($1) AS result',[order.id])).rows[0].result,false);
  approx(await wallet(),2000); assert.equal((await processEngine()).filled,0);
});

test('an unaffordable limit fill is cancelled, while unauthorized snapshot access and raw-engine grants stay blocked', async () => {
  const order=await open({type:'limit',limit:49000});
  await db.query('UPDATE public.balances SET usdt_balance=1 WHERE user_id=$1',[client]);
  await quote('BTCUSDT',48000); assert.equal((await processEngine()).filled,0);
  assert.equal((await db.query('SELECT status FROM public.futures_orders WHERE id=$1',[order.id])).rows[0].status,'cancelled');
  await login(null,'anon'); await rejects(()=>db.exec('SELECT public.get_my_derivative_positions()'),/Authentication required/);
  for (const signature of ['public.get_my_derivative_positions()','public.place_client_derivative_order(uuid,text,text,numeric,integer,text,text,numeric,numeric,numeric,numeric,uuid)']) {
    assert.equal((await db.query('SELECT has_function_privilege($1,$2,$3) AS allowed',['anon',signature,'EXECUTE'])).rows[0].allowed,false);
  }
});

test('percentage sizing never rounds above the client available margin for crypto or CFD lots', () => {
  for(const margin of [0.01,10,222.84,500,12345.67]) for(const price of [0.00000021,1.09984,65000,110000,230000]) {
    for(const decimals of [5,8]) {
      const amount=positionSizeForMargin(margin,10,price,decimals);
      assert.ok(amount*price/10 <= margin+1e-10, `${amount} must fit ${margin} at ${price}`);
    }
  }
});

test('legacy isolated positions keep their original liquidation threshold while new trades use maintenance', async () => {
  const legacy=await open();
  await db.query('UPDATE public.futures_positions SET maintenance_model=1 WHERE id=$1',[legacy.id]);
  const modern=await open();
  await quote('BTCUSDT',45300);
  assert.equal((await processEngine()).closed,1);
  const remaining=await values();assert.equal(remaining.length,1);assert.equal(remaining[0].id,legacy.id);
  const closed=(await db.query('SELECT id FROM public.futures_position_history')).rows;
  assert.deepEqual(closed.map(p=>p.id),[modern.id]);
  await quote('BTCUSDT',44000);assert.equal((await processEngine()).closed,1);
});

test('an unavailable FX conversion does not abort another client order or hide other positions', async () => {
  const forex=await open({symbol:'EUR/GBP',amount:1000,type:'limit',limit:0.87});
  const cryptoOrder=await open({type:'limit',limit:49000});
  await quote('EUR/GBP',0.86);await quote('GBP/USD',1.25,'7 minutes');await quote('BTCUSDT',48000);
  assert.equal((await processEngine()).filled,1);
  const orders=(await db.query('SELECT id,status FROM public.futures_orders')).rows;
  assert.equal(orders.find(o=>o.id===forex.id).status,'open');
  assert.equal(orders.find(o=>o.id===cryptoOrder.id).status,'filled');
  await quote('GBP/USD',1.25);await login(client,'service_role');
  await open({symbol:'EUR/GBP',amount:1000});await quote('GBP/USD',1.25,'7 minutes');
  const positions=await values();assert.equal(positions.length,2);
  assert.equal(positions.find(p=>p.symbol==='EUR/GBP').valuation_available,false);
  assert.equal(positions.find(p=>p.symbol==='BTCUSDT').valuation_available,true);
});

test('a pending fill unable to cover both spread legs and maintenance is cancelled without opening or charging', async () => {
  const order=await open({amount:0.00003,leverage:100,type:'limit',limit:49000});
  await quote('BTCUSDT',48000);assert.equal((await processEngine()).filled,0);
  assert.equal((await db.query('SELECT status FROM public.futures_orders WHERE id=$1',[order.id])).rows[0].status,'cancelled');
  assert.equal((await values()).length,0);approx(await wallet(),2000);
});
