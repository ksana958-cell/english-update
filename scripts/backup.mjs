import {DatabaseSync,backup} from 'node:sqlite';
import {resolve,dirname} from 'node:path';
import {mkdirSync} from 'node:fs';
const source=resolve(process.env.DATA_DIR||'./data','english-step.sqlite');
const target=resolve(process.argv[2]||`backups/english-step-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
mkdirSync(dirname(target),{recursive:true});const db=new DatabaseSync(source,{readOnly:true});try{await backup(db,target);console.log(target)}finally{db.close()}
