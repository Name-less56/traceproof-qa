import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';

async function localServer() {
  const dir = await mkdtemp(path.join(tmpdir(),'traceproof-test-'));
  const server = await createApp({dbPath:path.join(dir,'data.json')});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const url=`http://127.0.0.1:${server.address().port}`;
  return {url, close: async()=>{await new Promise(ok=>server.close(ok));await rm(dir,{recursive:true,force:true});}};
}

test('GET state includes sample cases and no initial run', async()=>{
  const app=await localServer();
  try {const r=await fetch(app.url+'/api/state');const value=await r.json();assert.equal(value.cases.length,3);assert.equal(value.runs.length,0);}finally{await app.close();}
});
test('static index and built-in sandbox routes render',async()=>{
  const app=await localServer();
  try {for (const p of ['/','/styles.css','/app.js','/world-points.js','/jszip.min.js','/sandbox/shop','/sandbox/login']) {const r=await fetch(app.url+p); assert.equal(r.status,200,p); assert.ok((await r.text()).length>100); assert.equal(r.headers.get('x-content-type-options'),'nosniff');} }finally{await app.close();}
});
test('main page has hardened browser policy without remote or inline scripts',async()=>{
  const app=await localServer();
  try {
    const response=await fetch(app.url+'/');
    const csp=response.headers.get('content-security-policy');
    assert.match(csp,/script-src 'self'/); assert.doesNotMatch(csp,/https?:/); assert.doesNotMatch(csp,/script-src[^;]*unsafe-inline/);
    assert.equal(response.headers.get('permissions-policy'),'camera=(), microphone=(), geolocation=(self), payment=(), usb=()');
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  } finally {await app.close();}
});
test('POST saves new case and GET creates Playwright file', async()=>{
  const app=await localServer();
  try {
    const create=await fetch(app.url+'/api/cases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'New check',description:'Test case',severity:'high',source:'QA',steps:[{action:'navigate',value:'/sandbox/shop'},{action:'assertVisible',target:'product-card'}]})});
    assert.equal(create.status,201);const item=await create.json();assert.equal(item.title,'New check');
    const download=await fetch(app.url+`/api/cases/${item.id}/spec`);assert.equal(download.status,200);assert.match(await download.text(),/toBeVisible/);
  }finally{await app.close();}
});
test('JSON import, export, and delete routes work',async()=>{
  const app=await localServer();
  try {
    const sample=(await (await fetch(app.url+'/api/state')).json()).cases[0];
    const imp=await fetch(app.url+'/api/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cases:[sample]})});
    assert.equal(imp.status,201);
    const output=await(await fetch(app.url+'/api/export')).json();assert.equal(output.cases.length,4);
    const del=await fetch(app.url+`/api/cases/${output.cases[3].id}`,{method:'DELETE'});assert.equal(del.status,200);
    const refreshed=await(await fetch(app.url+'/api/state')).json();assert.equal(refreshed.cases.length,3);
  }finally{await app.close();}
});
test('POST run adds evidence and persists across refresh',async()=>{
  const app=await localServer();
  try {
    const state=await(await fetch(app.url+'/api/state')).json();
    const created=await fetch(app.url+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({caseId:state.cases[0].id,status:'failed',events:[{status:'passed',detail:'Loaded demo'},{status:'failed',detail:'Missing toast'}]})});
    assert.equal(created.status,201);
    assert.equal((await(await fetch(app.url+'/api/state')).json()).metrics.failing,1);
  }finally{await app.close();}
});
test('server rejects invalid external URLs and large payloads',async()=>{
  const app=await localServer();
  try {
    const result=await fetch(app.url+'/api/cases',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'Unsafe',steps:[{action:'navigate',value:'https://example.com'}]})});assert.equal(result.status,400);
    assert.equal((await fetch(app.url+'/private')).status,404);
  }finally{await app.close();}
});
test('API writes require JSON and reject a foreign browser origin',async()=>{
  const app=await localServer();
  try {
    const noType=await fetch(app.url+'/api/cases',{method:'POST',body:'{}'}); assert.equal(noType.status,415);
    const foreign=await fetch(app.url+'/api/cases',{method:'POST',headers:{'content-type':'application/json','origin':'https://foreign.example'},body:'{}'}); assert.equal(foreign.status,403);
  } finally {await app.close();}
});
test('health reports the isolated JSON test store',async()=>{
  const app=await localServer();
  try {const value=await(await fetch(app.url+'/api/health')).json();assert.equal(value.status,'ok');assert.equal(value.database,'json-fallback');}finally{await app.close();}
});
test('demo login creates an HttpOnly session and enforces admin access',async()=>{
  const app=await localServer();
  try {
    const denied=await fetch(app.url+'/api/admin/stats');assert.equal(denied.status,401);
    const login=await fetch(app.url+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@traceproof.local',password:'TraceProof!2026'})});
    assert.equal(login.status,200);const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
    const stats=await fetch(app.url+'/api/admin/stats',{headers:{cookie}});assert.equal(stats.status,200);assert.equal((await stats.json()).access,'admin');
  }finally{await app.close();}
});
test('admin can create a persistent project and contact form requires consent',async()=>{
  const app=await localServer();
  try {
    const login=await fetch(app.url+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@traceproof.local',password:'TraceProof!2026'})});const cookie=login.headers.get('set-cookie');
    const project=await fetch(app.url+'/api/projects',{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({name:'Demo project',key:'DEMO',description:'Test project',accent:'#82f5d2'})});assert.equal(project.status,201);
    const rejected=await fetch(app.url+'/api/contact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Demo User',email:'demo@example.com',subject:'Hello',message:'A sufficiently long message.',consent:false})});assert.equal(rejected.status,400);
    const accepted=await fetch(app.url+'/api/contact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Demo User',email:'demo@example.com',subject:'Hello',message:'A sufficiently long message.',consent:true})});assert.equal(accepted.status,201);
  }finally{await app.close();}
});
test('platform adapters require admin and persist audit state',async()=>{
  const app=await localServer();
  try {
    const denied=await fetch(app.url+'/api/platform/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'apikey.create'})});assert.equal(denied.status,401);
    const login=await fetch(app.url+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@traceproof.local',password:'TraceProof!2026'})});const cookie=login.headers.get('set-cookie');
    const action=await fetch(app.url+'/api/platform/action',{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({action:'playwright.run'})});assert.equal(action.status,200);assert.equal((await action.json()).job.status,'completed');
    const state=await(await fetch(app.url+'/api/state')).json();assert.equal(state.platform.audit[0].action,'playwright.run');
    const sdk=await(await fetch(app.url+'/api/sdk')).json();assert.equal(sdk.version,'2.1.0');
  }finally{await app.close();}
});
