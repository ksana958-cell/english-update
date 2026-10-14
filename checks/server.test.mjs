import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
import {passwordHash} from '../lib/password.mjs';
import {defaultState} from '../public/progress-core.mjs';
const dir=await mkdtemp(join(tmpdir(),'english-step-test-'));const password='test-only-'+randomUUID();const hash=await passwordHash(password);let app;
const config={PUBLIC_URL:'http://localhost:3000',ADMIN_LOGIN:'testlearner',ADMIN_PASSWORD_HASH:hash,DATA_DIR:dir};
async function start(){app=createApp(config);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${app.server.address().port}`}
try{let url=await start();const call=(path,opts={})=>fetch(url+path,{redirect:'manual',...opts});
 assert.equal((await call('/')).status,303);assert.equal((await call('/api/progress')).status,401);assert.equal((await call('/login')).status,200);
 assert.equal((await call('/api/progress',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'fake'}})).status,401);
 const sign=async p=>call('/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3000'},body:JSON.stringify({login:'testlearner',password:p})});
 assert.equal((await sign('bad')).status,401);const login=await sign(password);assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];assert(login.headers.get('set-cookie').includes('HttpOnly'));assert(login.headers.get('set-cookie').includes('SameSite=Lax'));
 const login2=await sign(password),cookie2=login2.headers.get('set-cookie').split(';')[0];assert.notEqual(cookie,cookie2);
 const first=await call('/api/progress',{headers:{Cookie:cookie}});assert.equal(first.status,200);assert.equal((await first.json()).state,null);
 const state=defaultState();state.xp=10;const payload={revision:0,epoch:0,requestId:randomUUID(),state};
 const put=(p,c=cookie,origin='http://localhost:3000')=>call('/api/progress',{method:'PUT',headers:{Cookie:c,'Content-Type':'application/json',Origin:origin},body:JSON.stringify(p)});
 assert.equal((await put(payload,cookie,'https://evil.test')).status,403);
 const saved=await put(payload);assert.equal(saved.status,200);assert.equal((await saved.json()).revision,1);
 const duplicate=await put(payload);assert.equal((await duplicate.json()).revision,1);
 const stale=await put({...payload,requestId:randomUUID()},cookie2);assert.equal(stale.status,409);
 const phone=await call('/api/progress',{headers:{Cookie:cookie2}});assert.equal((await phone.json()).state.xp,10);
 assert.equal((await call('/',{headers:{Cookie:cookie}})).status,200);assert.equal((await call('/cloud-sync.mjs',{headers:{Cookie:cookie}})).status,200);assert.equal((await call('/.env',{headers:{Cookie:cookie}})).status,404);
 for(const [path,count,key] of [['/media-lessons.json',20,null],['/film-selection.json',24,'films']]){const response=await call(path,{headers:{Cookie:cookie}});assert.equal(response.status,200);const data=await response.json();assert.equal((key?data[key]:data).length,count)}
 await app.close();app=null;url=await start();assert.equal((await (await call('/api/progress',{headers:{Cookie:cookie2}})).json()).state.xp,10,'session and progress persist across restart');
 assert.equal((await call('/auth/logout',{method:'POST',headers:{Cookie:cookie2,Origin:'http://localhost:3000'}})).status,303);assert.equal((await call('/api/progress',{headers:{Cookie:cookie2}})).status,401);
 await app.close();app=null;config.ADMIN_PASSWORD_HASH=await passwordHash('changed-'+randomUUID());url=await start();assert.equal((await call('/api/progress',{headers:{Cookie:cookie}})).status,401,'password rotation revokes old sessions');
 assert.equal((await (await call('/healthz')).json()).ok,true);
 console.log('PASS: HTTP login, cookies, protected API, forged identity rejection, origin validation, SQLite persistence, two sessions, conflict/idempotency, static files, logout and credential rotation.');
}finally{if(app)await app.close();await rm(dir,{recursive:true,force:true})}
