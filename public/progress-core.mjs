function defaultState(){return {version:1,name:'Глеб',goal:10,units:{},items:{},days:{},stars:[],notes:{},spoken:{},xp:0,recommended:1,settings:{rate:.85,track:'grammarway'}}}
function validateState(data){
 if(!data||data.version!==1||typeof data.name!=='string'||data.name.length>40||![5,10,15,20].includes(data.goal)||!Number.isFinite(data.xp)||data.xp<0)throw new Error('Формат файла не поддерживается.');
 for(const name of ['units','items','days','notes','spoken'])if(!data[name]||typeof data[name]!=='object'||Array.isArray(data[name]))throw new Error('В файле нет данных прогресса.');
 const clean=defaultState();clean.name=data.name;clean.goal=data.goal;clean.xp=data.xp;clean.recommended=Math.min(109,Math.max(1,Number(data.recommended)||1));
 for(const [k,v] of Object.entries(data.units)){if(!/^(?:[1-9]|[1-9][0-9]|10[0-9])$/.test(k)||!v||!Number.isFinite(v.best)||v.best<0||v.best>100||!Number.isFinite(v.attempts))throw new Error('Повреждены результаты уроков.');clean.units[k]={best:v.best,attempts:v.attempts,completed:!!v.completed,last:Number(v.last)||0}}
 for(const [k,v] of Object.entries(data.items)){if(!/^u\d+-q\d+$/.test(k)||!v||!Number.isFinite(v.due)||!Number.isInteger(v.stage)||v.stage<0||v.stage>4||!Number.isFinite(v.attempts)||!Number.isFinite(v.correct))throw new Error('Повреждена очередь повторения.');clean.items[k]={due:v.due,stage:v.stage,attempts:v.attempts,correct:v.correct,lastWrong:!!v.lastWrong,updatedAt:Number(v.updatedAt)||0}}
 for(const [k,v] of Object.entries(data.days)){if(!/^\d{4}-\d{2}-\d{2}$/.test(k)||!v||!Number.isFinite(v.answers)||v.answers<0||!Number.isFinite(v.correct)||v.correct<0)throw new Error('Повреждена статистика.');clean.days[k]={answers:v.answers,correct:v.correct,lessons:Number(v.lessons)||0,spoken:Number(v.spoken)||0}}
 for(const [k,v]of Object.entries(data.notes))if(/^\d+$/.test(k)&&typeof v==='string')clean.notes[k]=v.slice(0,5000);
 for(const [k,v]of Object.entries(data.spoken))if(/^\d+$/.test(k)&&typeof v==='boolean')clean.spoken[k]=v;
 if(!Array.isArray(data.stars)||data.stars.some(x=>typeof x!=='string'||!/^u\d+-v\d+$/.test(x)))throw new Error('Повреждён словарь.');
 clean.stars=[...new Set(data.stars)];clean.settings.rate=[.65,.85,1].includes(data.settings?.rate)?data.settings.rate:.85;clean.settings.track=['grammarway','english-file','dk'].includes(data.settings?.track)?data.settings.track:'grammarway';return clean;
}

export {defaultState,validateState};
const clone=o=>JSON.parse(JSON.stringify(o));
const different=(a,b)=>JSON.stringify(a)!==JSON.stringify(b);
const count=v=>Math.max(0,Number(v)||0);
function itemTime(v){if(!v)return 0;return v.updatedAt||v.due-(v.lastWrong?600000:[1,3,7,14,30][v.stage]*86400000)}
export function mergeProgress(base,local,remote){
 const out=clone(remote);
 for(const k of ['name','goal','recommended'])if(different(local[k],base[k]))out[k]=local[k];
 if(different(local.settings,base.settings))out.settings=clone(local.settings);
 out.xp=count(remote.xp)+Math.max(0,count(local.xp)-count(base.xp));
 for(const [day,v]of Object.entries(local.days)){const b=base.days[day]||{},r=remote.days[day]||{};out.days[day]={};for(const k of ['answers','correct','lessons','spoken'])out.days[day][k]=count(r[k])+Math.max(0,count(v[k])-count(b[k]))}
 for(const [id,v]of Object.entries(local.units)){const b=base.units[id]||{},r=remote.units[id]||{};out.units[id]={best:Math.max(v.best,r.best||0),completed:!!v.completed||!!r.completed,attempts:count(r.attempts)+Math.max(0,count(v.attempts)-count(b.attempts)),last:Math.max(v.last||0,r.last||0)}}
 for(const [id,v]of Object.entries(local.items)){const b=base.items[id]||{},r=remote.items[id];const chosen=!r||itemTime(v)>itemTime(r)?v:r;out.items[id]={...chosen,attempts:count(r?.attempts)+Math.max(0,count(v.attempts)-count(b.attempts)),correct:count(r?.correct)+Math.max(0,count(v.correct)-count(b.correct))}}
 const added=local.stars.filter(k=>!base.stars.includes(k)),removed=base.stars.filter(k=>!local.stars.includes(k));out.stars=[...new Set([...remote.stars,...added])].filter(k=>!removed.includes(k));
 for(const [id,note]of Object.entries(local.notes))if(different(note,base.notes[id]))out.notes[id]=note;
 for(const [id,v]of Object.entries(local.spoken))if(different(v,base.spoken[id]))out.spoken[id]=v;
 return validateState(out);
}
export function mergeInitial(local,remote){
 const out=mergeProgress(defaultState(),local,remote);out.xp=Math.max(local.xp,remote.xp);
 for(const [day,v]of Object.entries(local.days)){for(const k of ['answers','correct','lessons','spoken'])out.days[day][k]=Math.max(count(v[k]),count(remote.days[day]?.[k]))}
 for(const [id,v]of Object.entries(local.units))out.units[id].attempts=Math.max(v.attempts,remote.units[id]?.attempts||0);
 for(const [id,v]of Object.entries(local.items)){out.items[id].attempts=Math.max(v.attempts,remote.items[id]?.attempts||0);out.items[id].correct=Math.max(v.correct,remote.items[id]?.correct||0)}
 return validateState(out);
}
