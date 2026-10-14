import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
export function openDatabase(path){
 mkdirSync(dirname(path),{recursive:true});const sql=new DatabaseSync(path);sql.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 sql.exec(`CREATE TABLE IF NOT EXISTS learner_progress(user_id TEXT PRIMARY KEY NOT NULL,state_json TEXT NOT NULL,revision INTEGER NOT NULL,epoch INTEGER NOT NULL,last_request_id TEXT NOT NULL,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS progress_receipts(user_id TEXT NOT NULL,request_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,request_id));
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY NOT NULL,expires_at INTEGER NOT NULL,credential_tag TEXT NOT NULL);`);
 class Statement{constructor(query,args=[]){this.query=query;this.args=args}bind(...args){return new Statement(this.query,args)}async first(){return sql.prepare(this.query).get(...this.args)||null}}
 const db={prepare:q=>new Statement(q),batch:async statements=>{sql.exec('BEGIN IMMEDIATE');try{const rows=statements.map(s=>sql.prepare(s.query).run(...s.args));sql.exec('COMMIT');return rows}catch(err){sql.exec('ROLLBACK');throw err}}};
 return {db,sql};
}
