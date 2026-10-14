(async()=>{
const core=await import('../public/progress-core.mjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../public');
const units=[...JSON.parse(fs.readFileSync(path.join(root,'units-1.json'))),...JSON.parse(fs.readFileSync(path.join(root,'units-2.json')))];
assert.equal(units.length,20);
const seen=new Set();let total=0;
const normalize=s=>s.toLowerCase().replace(/[’‘`]/g,"'").replace(/[.,!?;:"“”]/g,'').replace(/\s+/g,' ').trim();
for(const u of units){assert(!seen.has(u.id));seen.add(u.id);assert.equal(u.rules.length,3);assert.equal(u.vocab.length,4);assert.equal(u.dialogue.length,4);assert(u.exercises.length>=8);for(const q of u.exercises){total++;assert(q.prompt&&q.explanation);if(q.type==='choice'){assert(q.options.includes(q.answer));assert.equal(new Set(q.options).size,q.options.length)}else assert(q.answers.length);if(q.type==='listen')assert(q.answers.some(a=>normalize(a)===normalize(q.audio)));if(q.type==='order')for(const a of q.answers)assert.equal(normalize(q.words.join(' ')).split(' ').sort().join('|'),normalize(a).split(' ').sort().join('|'))}}
class Element{constructor(){this.dataset={};this.value='';this.open=false;this.nodes={};this.classList={add(){},remove(){},toggle(){}}}set innerHTML(v){this.html=v;this.nodes={}}get innerHTML(){return this.html||''}querySelector(s){return this.nodes[s]??(this.nodes[s]=new Element())}querySelectorAll(s){if(s==='.choice'){const n=(this.innerHTML.match(/class="choice"/g)||[]).length;return Array.from({length:n},(_,i)=>this.querySelector('.choice'+i))}return []}setAttribute(){}scrollIntoView(){}focus(){}addEventListener(){}showModal(){this.open=true}close(){this.open=false}click(){}}
const elements={};const getEl=k=>elements[k]??(elements[k]=new Element());let stored={};
const context={defaultState:core.defaultState,validateState:core.validateState,CloudSync:class {constructor(opts){Object.assign(this,opts);this.status='saved';this.user=null}save(){return true}read(){return null}persist(){}async initialize(){return true}async sync(){return true}},setInterval:()=>0,console,Date,Math,JSON,Object,Array,Map,Set,Number,String,Promise,Blob,URL,FormData:class{},confirm:()=>true,setTimeout:()=>0,clearTimeout(){},location:{hash:'#home'},localStorage:{getItem:k=>stored[k]??null,setItem:(k,v)=>stored[k]=v},document:{querySelector:getEl,getElementById:getEl,body:{style:{}},querySelectorAll:()=>[],addEventListener(){},createElement:()=>new Element()},window:{addEventListener(){},scrollTo(){}},fetch:async p=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'))})};context.window.location=context.location;
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/^import .*$/gm,''),context);
const run=s=>vm.runInContext(s,context);
(async()=>{await new Promise(r=>setImmediate(r));assert.equal(run('units.length'),109);assert.equal(run('allQuestions.length'),627);assert.equal(run('words.length'),436);
 for(const page of ['home','course','review','words','films','progress','method','settings']){run(`route='${page}';filter='all';shell()`);const html=getEl('main').innerHTML;assert(html.length>500,page);assert(!/NaN|undefined/.test(html),page)}
 run('openLesson(1)');assert(getEl('lessonDialog').open);assert(getEl('lessonContent').innerHTML.includes('Русская привычка'));run("lessonTab='speak';renderLesson()");assert(getEl('lessonContent').innerHTML.includes('speakingNote'));run('closeModal()');assert(!getEl('lessonDialog').open);

 // All advanced modules must render and save without losing legacy units.
 const books=JSON.parse(run('JSON.stringify(units)'));
 assert.equal(books.filter(u=>u.track==='english-file').length,20);assert(books.filter(u=>u.track==='english-file').every(u=>u.reading?.text));
 assert.equal(books.filter(u=>u.track==='dk').length,69);
 for(const t of ['grammarway','english-file','dk']){
   run(`state.settings.track='${t}';route='course';filter='all';query='';shell()`);
   assert(getEl('main').innerHTML.includes('track-switcher'));
   const count=books.filter(u=>u.track===t).length;
   assert.equal((getEl('main').innerHTML.match(/class="lesson-card"/g)||[]).length,count);
   const one=books.find(u=>u.track===t);run(`openLesson(${one.id})`);
   assert(getEl('lessonContent').innerHTML.includes(one.ru));
   run('closeModal()');
 }
 run("state.settings.track='grammarway'");
 const media=JSON.parse(run('JSON.stringify(mediaLessons)')),catalog=JSON.parse(run('JSON.stringify(filmCatalog)'));
 assert.equal(media.length,20);assert.equal(catalog.films.length,24);
 assert.deepEqual(catalog.levels.map(x=>x.id),['A1','A2','B1','B2','C1','C2']);
 assert.equal(new Set(catalog.films.map(x=>x.id)).size,24);
 for(const group of media){assert(seen.has(group.unitId));assert.deepEqual(group.examples.map(x=>x.kind),['film','comic']);run(`openLesson(${group.unitId})`);const html=getEl('lessonContent').innerHTML;assert.equal((html.match(/class="media-example /g)||[]).length,2);assert(html.includes('не являются дословными цитатами'));for(const ex of group.examples){assert(ex.en.includes(ex.focus));for(const key of ['context','en','ru','focus','why','prompt','answer','answerWhy'])assert(ex[key]?.trim());assert(new URL(ex.source.url).protocol==='https:');assert(html.includes(run(`e(${JSON.stringify(ex.focus)})`)));assert(html.includes('Показать ответ и разбор'))}}
 for(const f of catalog.films){assert(catalog.levels.some(x=>x.id===f.level));assert(f.units.every(x=>seen.has(x)));for(const key of ['title','ru','genre','accent','why','challenge','watch','task'])assert(f[key]?.trim());assert(new URL(f.source.url).protocol==='https:')}
 run("closeModal();route='films';filter='all';query='';shell()");assert.equal((getEl('main').innerHTML.match(/class="film-card"/g)||[]).length,24);
 for(const level of catalog.levels){run(`handleAction('film-filter',null,{dataset:{filter:'${level.id}'}})`);assert.equal((getEl('main').innerHTML.match(/class="film-card"/g)||[]).length,4)}
 run("filter='all';query='Матрица';renderPage()");assert(getEl('main').innerHTML.includes('The Matrix'));assert.equal((getEl('main').innerHTML.match(/class="film-card"/g)||[]).length,1);
 run("query='no_such_film';renderPage()");assert(getEl('main').innerHTML.includes('Такой фильм пока не нашёлся'));
 run("query='';filter='all';handleAction('lesson','18',{});");assert(getEl('lessonDialog').open);assert(getEl('lessonContent').innerHTML.includes('Матрица'));
 run("handleAction('media-catalog',null,{})");assert(!getEl('lessonDialog').open);assert.equal(context.location.hash,'films');
 let spoken='';context.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};context.window.speechSynthesis={cancel(){},getVoices(){return []},speak(u){spoken=u.text}};
 run("openLesson(4);handleAction('speak-media','0',{})");assert.equal(spoken,media[3].examples[0].en);run('closeModal()');
 const result=run(`(()=>{state=defaultState();let count=0;for(const u of units){startSession('lesson',u.exercises,u.id);for(let i=0;i<u.exercises.length;i++){const q=session.questions[session.index];if(q.type==='choice')session.value=q.answer;else if(q.type==='order'){const used=new Set();session.selected=normal(q.answers[0]).split(' ').map(w=>{const n=q.words.findIndex((x,j)=>!used.has(j)&&normal(x)===w);if(n<0)throw Error('Token missing');used.add(n);return n})}else content.querySelector('#answerInput').value=q.answers[0];checkAnswer();if(!session.results.at(-1).ok)throw Error('Correct answer rejected '+q.key);nextQuestion();count++}if(!state.units[u.id].completed)throw Error('Completion missing')}return {count,completed:completion(),answers:dayStats().answers,xp:state.xp}})()`);
 assert.equal(result.count,627);assert.equal(result.completed,20);assert.equal(result.answers,627);assert.equal(result.xp,6270);
 run("state=defaultState();recordAnswer(allQuestions[0],true,false)");let item=JSON.parse(run('JSON.stringify(state.items[allQuestions[0].key])'));assert.equal(item.stage,0);assert(Math.abs(item.due-Date.now()-86400000)<1000);const firstDue=item.due;run('recordAnswer(allQuestions[0],true,false)');assert.equal(run('state.items[allQuestions[0].key].due'),firstDue);assert.equal(run('state.items[allQuestions[0].key].stage'),0);
 run('state.items[allQuestions[0].key].due=Date.now()-100;recordAnswer(allQuestions[0],true,false)');assert.equal(run('state.items[allQuestions[0].key].stage'),1);assert(Math.abs(run('state.items[allQuestions[0].key].due')-Date.now()-3*86400000)<1000);
 run('recordAnswer(allQuestions[0],false,false)');assert.equal(run('errorQuestions().length'),1);assert(Math.abs(run('state.items[allQuestions[0].key].due')-Date.now()-600000)<1000);run('recordAnswer(allQuestions[0],true,false)');assert.equal(run('state.items[allQuestions[0].key].stage'),0);assert(Math.abs(run('state.items[allQuestions[0].key].due')-Date.now()-86400000)<1000);assert.equal(run('errorQuestions().length'),0);
 run("state=defaultState();startSession('lesson',units[0].exercises,1);checkAnswer()");assert.equal(run('session.results.length'),0);run('checkAnswer(true);nextQuestion()');assert.equal(run('session.index'),1);assert.equal(run('dayStats().correct'),0);assert.equal(run('errorQuestions().length'),1);
 run("state=defaultState();startSession('review',[allQuestions.find(q=>q.type==='listen')]);session.assisted=true;content.querySelector('#answerInput').value=session.questions[0].answers[0];checkAnswer();nextQuestion()");assert.equal(run('session.results[0].ok'),false);assert.equal(run('dayStats().correct'),0);
 assert(run(`correctAnswer({answers:["I don't know."]}," i DON’T know! ")`));assert(!run(`correctAnswer({answers:['your']},"you're")`));
 run("state=defaultState();state.name='<script>alert(1)</script>';save();route='home';shell()");assert(!getEl('main').innerHTML.includes('<script>'));assert(getEl('main').innerHTML.includes('&lt;script&gt;'));const restored=run('JSON.stringify(validateState(JSON.parse(JSON.stringify(state))))');assert.equal(JSON.parse(restored).name,'<script>alert(1)</script>');assert.throws(()=>run('validateState({version:2})'));assert.throws(()=>run('validateState({...defaultState(),items:{bad:{}}})'));
 run("state=defaultState();state.days[today()]={answers:2,correct:1};state.days[today(-1)]={answers:1,correct:1};state.days[today(-2)]={answers:1,correct:1}");assert.equal(run('streak()'),3);
 run("state=defaultState();state.units[1]={completed:true,best:100,attempts:1,last:1};state.recommended=1");assert.equal(run('nextUnit().id'),2);
 run("route='course';query='past';filter='all';shell()");assert(getEl('main').innerHTML.includes('Past Simple'));run("route='words';query='bottle';filter='all';shell()");assert(getEl('main').innerHTML.includes('bottle'));
 for(const p of ['styles.css','app.js','icon.svg','cloud-sync.mjs'])assert(fs.statSync(path.join(root,p)).size>0);
 console.log(JSON.stringify({status:'PASS',units:109,exercises:627,vocabulary:436,checks:['curriculum schema and answer consistency','all 627 correct answers accepted','all 109 lesson completions','8 page renders without undefined values; 3 track filters','empty answer and incorrect answer flows','listening assistance excluded from score','spaced schedule and early-review protection','error recovery and interval reset','import schema and escaped user content','streak and next lesson','dictionary and course filtering','40 media examples across all 20 lessons','24 films and 6 level filters, search, related lesson navigation','media example speech dispatch'],limits:'DOM simulation only; no browser visual or voice-device check'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});

})().catch(e=>{console.error(e);process.exitCode=1});
