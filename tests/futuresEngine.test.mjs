import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const user='94000000-0000-0000-0000-000000000001';
const position='94000000-0000-0000-0000-000000000002';
const requestKey='94000000-0000-0000-0000-000000000003';
const source=(await readFile(new URL('../supabase/functions/futures-engine/index.ts',import.meta.url),'utf8')).replace(/^import .*;\r?$/gm,'');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;

function engine({age=0,authorized=true,rpcError=null}={}) {
  const calls=[]; let handler;
  const admin={
    auth:{getUser:async()=>({data:{user:authorized?{id:user}:null},error:null})},
    from:table=>{
      const filters={}; const query={
        select:()=>query,eq:(key,value)=>{filters[key]=value;return query;},
        single:async()=>({data:table==='futures_positions'
          ? filters.id===position && filters.user_id===user ? {id:position,user_id:user,symbol:'BTCUSDT'}:null
          : {price:50000,timestamp:new Date(Date.now()-age).toISOString()},error:null}),
      }; return query;
    },
    rpc:async(name,args)=>{calls.push({name,args});return {data:name==='close_futures_position'?9:{success:true,id:position},error:rpcError};},
  };
  vm.runInNewContext(code,{createClient:()=>admin,CFD_QUOTE_MAX_AGE_MS:360000,CRYPTO_QUOTE_MAX_AGE_MS:360000,
    Deno:{env:{get:()=> 'test-value'},serve:fn=>{handler=fn;}},Response,Request,console:{error:()=>{}}});
  return {calls,request:body=>handler(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer verified-user-token'},body:JSON.stringify(body)}))};
}

test('client opening authorizes the real user, uses the provider cache, and forwards retry identity',async()=>{
  const app=engine();
  const response=await app.request({action:'place',symbol:'BTCUSDT',side:'long',amount:0.01,leverage:10,marginType:'isolated',orderType:'market',price:1,user_id:'forged-user',requestKey});
  assert.equal(response.status,200);
  const {name,args}=app.calls[0]; assert.equal(name,'place_client_derivative_order');
  assert.equal(args.p_user_id,user);assert.equal(args.p_market_price,50000);assert.equal(args.p_request_key,requestKey);
});

test('legacy published clients can still place orders before the retry-aware frontend is published',async()=>{
  const app=engine();
  assert.equal((await app.request({action:'place',symbol:'BTCUSDT',side:'short',amount:0.01,leverage:10,marginType:'isolated',orderType:'market'})).status,200);
  assert.equal(app.calls[0].args.p_request_key,null);
});

test('closing ignores a browser exit price and only closes a position belonging to the verified user',async()=>{
  const app=engine();
  assert.equal((await app.request({action:'close',positionId:position,exitPrice:999999})).status,200);
  assert.equal(app.calls[0].args.exit_price,50000);
  app.calls.length=0;
  assert.equal((await app.request({action:'close',positionId:'another-client-position'})).status,404);
  assert.equal(app.calls.length,0);
});

test('both stale and future-dated quotes are rejected before financial RPCs',async()=>{
  for(const age of [7*60000,-2*60000]) {
    const app=engine({age});
    const response=await app.request({action:'place',symbol:'BTCUSDT',side:'long',amount:0.01,leverage:10,marginType:'isolated',orderType:'market'});
    assert.equal(response.status,400);assert.match((await response.json()).error,/stale/);assert.equal(app.calls.length,0);
  }
});

test('real PostgreSQL validation messages reach the client instead of a generic trading failure',async()=>{
  const app=engine({rpcError:{message:'Insufficient available margin'}});
  const response=await app.request({action:'place',symbol:'BTCUSDT',side:'long',amount:0.01,leverage:10,marginType:'isolated',orderType:'market'});
  assert.equal(response.status,400);assert.equal((await response.json()).error,'Insufficient available margin');
});

test('invalid sessions and malformed request references cannot execute an order',async()=>{
  const unauth=engine({authorized:false});assert.equal((await unauth.request({action:'close',positionId:position})).status,401);
  const app=engine();assert.equal((await app.request({action:'place',requestKey:'bad-reference'})).status,400);assert.equal(app.calls.length,0);
});
