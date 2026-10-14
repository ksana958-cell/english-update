import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {writeFile,readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {passwordHash} from '../lib/password.mjs';
const reset=process.argv.includes('--reset-password');
const rl=createInterface({input:stdin,output:stdout});
try{
 let existing='';if(reset)existing=await readFile('.env','utf8');
 let url,login;
 if(reset){url=existing.match(/^PUBLIC_URL=(.+)$/m)?.[1];login=existing.match(/^ADMIN_LOGIN=(.+)$/m)?.[1];if(!url||!login)throw Error('В .env нет PUBLIC_URL или ADMIN_LOGIN.')}
 else {url=(await rl.question('Адрес сайта (например https://english.example.com): ')).trim();login=(await rl.question('Логин [gleb]: ')).trim()||'gleb'}
 const u=new URL(url);if(u.origin!==url.replace(/\/$/,''))throw Error('Введи адрес без пути, например https://english.example.com');
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('Для сервера нужен https://. Для проверки можно http://localhost:3000.');
 if(!/^[a-zA-Z0-9_.@-]{3,80}$/.test(login))throw Error('Логин: 3–80 латинских букв, цифр, точек, @, - или _.');
 const password=randomBytes(18).toString('base64url'),hash=await passwordHash(password);
 const contents=reset?existing.replace(/^ADMIN_PASSWORD_HASH=.*$/m,`ADMIN_PASSWORD_HASH=${hash}`):`SITE_DOMAIN=${u.host}\nPUBLIC_URL=${u.origin}\nADMIN_LOGIN=${login}\nADMIN_PASSWORD_HASH=${hash}\nPORT=3000\nDATA_DIR=./data\n`;
 await writeFile('.env',contents,{mode:0o600,flag:reset?'w':'wx'});
 console.log(`\nНастройки записаны в .env.\nЛогин: ${login}\nПароль: ${password}\nСохрани пароль в менеджере паролей. ${reset?'Перезапусти приложение; старые сессии будут отозваны.':''}`);
}catch(err){console.error(err.code==='EEXIST'?'Файл .env уже существует. Для нового пароля добавь --reset-password.':err.message);process.exitCode=1}finally{rl.close()}
