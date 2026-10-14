import {defaultState,validateState,mergeProgress,mergeInitial} from './progress-core.mjs';
const copy=v=>JSON.parse(JSON.stringify(v));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const CACHE='english-step-account:';
export class CloudSync {
 constructor({getState,setState,onStatus=()=>{},onRemote=()=>{},onNotice=()=>{},storage=globalThis.localStorage,fetcher=globalThis.fetch,makeId=()=>crypto.randomUUID()}){
  Object.assign(this,{getState,setState,onStatus,onRemote,onNotice,storage,fetcher,makeId});
  this.user=null;this.base=defaultState();this.revision=0;this.epoch=0;this.pending=null;this.dirty=false;this.status='connecting';this.lastSaved=0;this.busy=null;this.lastAccepted=null;
 }
 read(key){try{return this.storage.getItem(key)}catch{return null}}
 write(key,value){try{this.storage.setItem(key,value);return true}catch{return false}}
 setStatus(s){this.status=s;this.onStatus(s)}
 persist(){if(!this.user)return this.write('english-step-v1',JSON.stringify(this.getState()));return this.write(CACHE+this.user.id,JSON.stringify({user:this.user,state:this.getState(),base:this.base,revision:this.revision,epoch:this.epoch,pending:this.pending,dirty:this.dirty,lastSaved:this.lastSaved}))}
 save(){this.dirty=!equal(this.getState(),this.base)||!!this.pending||!this.revision;const ok=this.persist();this.setStatus(this.status==='offline'?'offline':this.dirty?'pending':'saved');return ok}
 async request(method='GET',body=null){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const r=await this.fetcher('/api/progress',{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:controller.signal,keepalive:body?JSON.stringify(body).length<60000:undefined});
   if(r.status===401||r.redirected||!r.headers.get('content-type')?.includes('application/json')){const err=new Error('Нужен вход в аккаунт');err.auth=true;throw err}
   const data=await r.json();if(!r.ok&&r.status!==409)throw new Error(data.error||'Сервер недоступен');
   return {data,conflict:r.status===409};
  }finally{clearTimeout(timer)}
 }
 adopt(data,newState){this.user=data.user;this.base=validateState(data.state||defaultState());this.revision=data.revision;this.epoch=data.epoch;this.lastSaved=data.updatedAt;this.setState(validateState(newState));this.dirty=!equal(this.getState(),this.base)||!data.state;this.pending=null;this.persist()}
 async initialize(){
  this.setStatus('connecting');
  try{
   const {data}=await this.request();const remote=validateState(data.state||defaultState());let cached=null;
   try{cached=JSON.parse(this.read(CACHE+data.user.id)||'null');if(cached){cached.state=validateState(cached.state);cached.base=validateState(cached.base);if(!Number.isSafeInteger(cached.revision)||!Number.isSafeInteger(cached.epoch))throw Error();if(cached.pending){cached.pending.state=validateState(cached.pending.state);cached.pending.base=validateState(cached.pending.base)}}}catch{cached=null}
   this.user=data.user;
   if(cached?.pending){this.base=cached.base;this.revision=cached.revision;this.epoch=cached.epoch;this.pending=cached.pending;this.dirty=true;this.lastSaved=cached.lastSaved;this.setState(cached.state)}
   else if(cached){
    if(cached.epoch!==data.epoch){if(cached.dirty)this.backup(cached.state);this.adopt(data,remote)}
    else this.adopt(data,!data.state?cached.state:cached.dirty?mergeProgress(cached.base,cached.state,remote):remote);
   }else{
    let legacy=null;try{if(!this.read('english-step-migrated-user'))legacy=validateState(JSON.parse(this.read('english-step-v1')||'null'))}catch{}
    this.adopt(data,legacy?(data.state?mergeInitial(legacy,remote):legacy):remote);
   }
   this.write('english-step-last-account',JSON.stringify(this.user));this.write('english-step-migrated-user',data.user.id);this.persist();this.setStatus(this.dirty?'pending':'saved');return true;
  }catch(err){
   if(!err.auth&&!this.user){try{const who=JSON.parse(this.read('english-step-last-account')||'null');const c=who?JSON.parse(this.read(CACHE+who.id)||'null'):null;if(c){this.setState(validateState(c.state));this.base=validateState(c.base);this.user=who;this.revision=c.revision;this.epoch=c.epoch;this.pending=c.pending;this.dirty=c.dirty;this.lastSaved=c.lastSaved}}catch{}}
   this.setStatus(err.auth?'auth':'offline');return false
  }
 }
 backup(s){this.write('english-step-conflict-backup',JSON.stringify(s));this.onNotice('На другом устройстве прогресс был заменён. Загружена серверная версия; локальная копия доступна в настройках.')}
 sync(){if(this.busy)return this.busy;this.busy=this.perform().finally(()=>this.busy=null);return this.busy}
 async perform(){
  try{
   if(!this.user&&!(await this.initialize()))return false;
   for(let tries=0;tries<5;tries++){
    if(!this.dirty&&!this.pending){
     const {data}=await this.request();if(data.user.id!==this.user.id){this.user=null;await this.initialize();this.onRemote();return false}
     const before=copy(this.getState());if(data.epoch!==this.epoch){if(this.dirty)this.backup(before);this.adopt(data,data.state||defaultState())}
     else this.adopt(data,mergeProgress(this.base,before,validateState(data.state||defaultState())));
     if(!equal(before,this.getState()))this.onRemote();
     if(!this.dirty){this.setStatus('saved');return true}
    }
    if(!this.pending)this.pending={state:copy(this.getState()),base:copy(this.base),revision:this.revision,epoch:this.epoch,requestId:this.makeId(),replace:false};
    this.persist();this.setStatus('saving');const sent=copy(this.pending);
    const {data,conflict}=await this.request('PUT',{state:sent.state,revision:sent.revision,epoch:sent.epoch,requestId:sent.requestId,replace:sent.replace});
    if(data.user.id!==this.user.id){this.user=null;await this.initialize();this.onRemote();return false}
    const expectedEpoch=sent.epoch+(!conflict&&sent.replace?1:0);
    const before=copy(this.getState());
    if(data.epoch!==expectedEpoch){this.backup(before);this.adopt(data,data.state||defaultState());this.onRemote();this.setStatus('saved');return false}
    if(!conflict)this.lastAccepted=sent.requestId;
    const merged=mergeProgress(conflict?sent.base:sent.state,before,validateState(data.state||defaultState()));
    this.adopt(data,merged);if(!equal(before,merged))this.onRemote();
    if(!this.dirty){this.setStatus('saved');return true}
   }
   this.setStatus('pending');return false;
  }catch(err){this.persist();this.setStatus(err.auth?'auth':'offline');return false}
 }
 async replace(newState){
  const ok=await this.sync();if(!ok||this.dirty||!this.user)throw Error('Нужна связь с сервером. Попробуй ещё раз после синхронизации.');
  const id=this.makeId();this.pending={state:copy(newState),base:copy(this.base),revision:this.revision,epoch:this.epoch,requestId:id,replace:true};this.setState(copy(newState));this.dirty=true;this.persist();await this.sync();
  if(this.lastAccepted!==id)throw Error('Сервер ещё не подтвердил замену. Не закрывай страницу; проверь индикатор сохранения.');
 }
}
