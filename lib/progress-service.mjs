import {validateState} from '../public/progress-core.mjs';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
export async function handleProgress(request,db,user){
 if(!user?.userId)return json({error:'Войди в свой аккаунт English Step.'},401);
 if(!db)return json({error:'Сохранение временно недоступно.'},503);
 const uid=user.userId;
 const read=()=>db.prepare('SELECT state_json, revision, epoch, updated_at FROM learner_progress WHERE user_id = ?').bind(uid).first();
 const payload=row=>({user:{id:uid,email:user.email},state:row?JSON.parse(row.state_json):null,revision:row?.revision||0,epoch:row?.epoch||0,updatedAt:row?.updated_at||0});
 if(request.method==='GET')return json(payload(await read()));
 if(request.method!=='PUT')return json({error:'Метод не поддерживается.'},405);
 const origin=request.headers.get('origin');
 if((origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Недопустимый источник запроса.'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Нужен JSON.'},415);
 let body;
 try {const text=await request.text();if(text.length>1500000)return json({error:'Слишком большой файл прогресса.'},413);body=JSON.parse(text)}catch{return json({error:'Повреждён запрос.'},400)}
 if(!Number.isSafeInteger(body.revision)||body.revision<0||!Number.isSafeInteger(body.epoch)||body.epoch<0||!/^[-a-zA-Z0-9_]{16,80}$/.test(body.requestId||''))return json({error:'Неверная версия прогресса.'},400);
 let state;try{state=validateState(body.state);if(Object.keys(state.days).length>10000||Object.keys(state.items).length>2000||state.xp>1e10)throw Error('Лимит')}catch{return json({error:'Не удалось проверить данные прогресса.'},400)}
 const receipt=()=>db.prepare('SELECT request_id FROM progress_receipts WHERE user_id = ? AND request_id = ?').bind(uid,body.requestId).first();
 if(await receipt())return json({...payload(await read()),accepted:true});
 const now=Date.now(),nextEpoch=body.epoch+(body.replace===true?1:0),encoded=JSON.stringify(state);
 const write=body.revision===0
  ? db.prepare('INSERT OR IGNORE INTO learner_progress (user_id,state_json,revision,epoch,last_request_id,updated_at) VALUES (?,?,1,?,?,?)').bind(uid,encoded,nextEpoch,body.requestId,now)
  : db.prepare('UPDATE learner_progress SET state_json=?, revision=revision+1, epoch=?, last_request_id=?, updated_at=? WHERE user_id=? AND revision=? AND epoch=?').bind(encoded,nextEpoch,body.requestId,now,uid,body.revision,body.epoch);
 await db.batch([write,db.prepare('INSERT OR IGNORE INTO progress_receipts (user_id,request_id,created_at) SELECT user_id,?,? FROM learner_progress WHERE user_id=? AND last_request_id=?').bind(body.requestId,now,uid,body.requestId)]);
 const row=await read();if(await receipt())return json({...payload(row),accepted:true});
 return json({...payload(row),error:'Прогресс обновился на другом устройстве.'},409);
}
