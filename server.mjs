import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {openDatabase} from './lib/database.mjs';
import {verifyPassword} from './lib/password.mjs';
import {handleProgress} from './lib/progress-service.mjs';
const ROOT=fileURLToPath(new URL('.',import.meta.url));
const digest=s=>createHash('sha256').update(s).digest('hex');
export function createApp(config=process.env){
 const base=new URL(config.PUBLIC_URL||'http://localhost:3000');
 if(base.pathname!=='/'||base.search||base.hash||base.username||base.password)throw Error('PUBLIC_URL must be an origin, without a path.');
 const secure=base.protocol==='https:';
 if(!secure&&!(base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)))throw Error('Use HTTPS for a public server. HTTP is allowed only for localhost.');
 const login=config.ADMIN_LOGIN||'';const hash=config.ADMIN_PASSWORD_HASH||'';
 if(!/^[a-zA-Z0-9_.@-]{3,80}$/.test(login)||!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash))throw Error('Set ADMIN_LOGIN and ADMIN_PASSWORD_HASH with scripts/configure.mjs.');
 const credentialTag=digest(login+':'+hash),{db,sql}=openDatabase(resolve(config.DATA_DIR||resolve(ROOT,'data'),'english-step.sqlite'));
 sql.prepare('DELETE FROM sessions WHERE expires_at < ? OR credential_tag != ?').run(Date.now(),credentialTag);
 const sessionsCookie=secure?'__Host-english_step':'english_step_local';
 const attempts=new Map();let activeLogins=0;
 const publicDir=resolve(ROOT,'public');
 function userFrom(req){const m=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(sessionsCookie+'='));const token=m?.slice(sessionsCookie.length+1);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;const session=sql.prepare('SELECT expires_at FROM sessions WHERE token_hash=? AND credential_tag=?').get(digest(token),credentialTag);return session&&session.expires_at>Date.now()?{userId:'owner',email:login}:null}
 const cookie=(token,maxAge=30*86400)=>`${sessionsCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`;
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"};
 function respond(res,status,body,type='application/json; charset=utf-8',extra={}){res.writeHead(status,{...headers,'Content-Type':type,...extra});res.end(typeof body==='string'?body:JSON.stringify(body))}
 function sameOrigin(req){return (!req.headers.origin||req.headers.origin===base.origin)&&req.headers['sec-fetch-site']!=='cross-site'}
 async function body(req,limit=1500000){let count=0;const chunks=[];for await(const chunk of req){count+=chunk.length;if(count>limit){const err=Error('Request too large');err.status=413;throw err}chunks.push(chunk)}return Buffer.concat(chunks).toString('utf8')}
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,base);const pathname=url.pathname;
   if(pathname==='/healthz'&&req.method==='GET'){sql.prepare('SELECT 1').get();return respond(res,200,{ok:true})}
   if(pathname==='/auth/login'&&req.method==='POST'){
    if(!sameOrigin(req))return respond(res,403,{error:'Недопустимый источник запроса.'});
    const now=Date.now(),key=req.socket.remoteAddress;let bucket=attempts.get(key);
    if(!bucket||bucket.until<now){bucket={count:0,until:now+15*60000};attempts.set(key,bucket)}
    if(bucket.count>=10||activeLogins>=4)return respond(res,429,{error:'Слишком много попыток. Подожди 15 минут.'});
    bucket.count++;activeLogins++;
    try{let data;try{data=JSON.parse(await body(req,4096))}catch{return respond(res,400,{error:'Неверный запрос.'})}
     const valid=await verifyPassword(data.password,hash);
     if(!valid||data.login!==login)return respond(res,401,{error:'Неверный логин или пароль.'});
     attempts.delete(key);const token=randomBytes(32).toString('hex');sql.prepare('INSERT INTO sessions(token_hash,expires_at,credential_tag) VALUES (?,?,?)').run(digest(token),now+30*86400000,credentialTag);
     return respond(res,200,{ok:true},'application/json; charset=utf-8',{'Set-Cookie':cookie(token)});
    }finally{activeLogins--}
   }
   if(pathname==='/auth/logout'&&req.method==='POST'){
    if(!sameOrigin(req))return respond(res,403,{error:'Недопустимый источник запроса.'});
    const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(sessionsCookie+'='))?.slice(sessionsCookie.length+1);
    if(token)sql.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
    return respond(res,303,'','text/plain',{'Set-Cookie':cookie('',0),Location:'/login'});
   }
   const user=userFrom(req);
   if(pathname==='/api/progress'){
    if(!user)return respond(res,401,{error:'Войди в свой аккаунт English Step.'});
    if(!['GET','PUT'].includes(req.method))return respond(res,405,{error:'Метод не поддерживается.'});
    const requestHeaders=new Headers();for(const k of ['content-type','origin','sec-fetch-site'])if(req.headers[k])requestHeaders.set(k,req.headers[k]);
    const request=new Request(new URL('/api/progress',base),{method:req.method,headers:requestHeaders,body:req.method==='PUT'?await body(req):undefined});
    const response=await handleProgress(request,db,user);return respond(res,response.status,await response.text());
   }
   if(!['GET','HEAD'].includes(req.method))return respond(res,405,{error:'Метод не поддерживается.'});
   const loginAsset=pathname==='/login'||pathname==='/login.js'||pathname==='/icon.svg';
   if(!user&&!loginAsset)return respond(res,303,'','text/plain',{Location:'/login'});
   if(pathname==='/login'&&user)return respond(res,303,'','text/plain',{Location:'/'});
   const name=pathname==='/'?'index.html':pathname==='/login'?'login.html':decodeURIComponent(pathname).slice(1);
   const path=resolve(publicDir,name);if(!path.startsWith(publicDir+sep)||name.split('/').some(p=>p.startsWith('.')))return respond(res,404,{error:'Не найдено.'});
   const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
   const data=await readFile(path);res.writeHead(200,{...headers,'Content-Type':types[extname(path)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data);
  }catch(err){respond(res,err.code==='ENOENT'?404:err.status||500,{error:err.code==='ENOENT'?'Не найдено.':'Не удалось обработать запрос.'})}
 });
 server.requestTimeout=20000;server.headersTimeout=15000;
 return {server,sql,close:()=>new Promise(done=>server.close(()=>{sql.close();done()}))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const app=createApp();const port=Number(process.env.PORT||3000);app.server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`English Step listening on port ${port}`));for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>app.close().then(()=>process.exit(0)))}catch(err){console.error(err.message);process.exitCode=1}
}
