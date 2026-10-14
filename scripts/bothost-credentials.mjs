// Run locally: node scripts/bothost-credentials.mjs
// Never commit the output hash or password to a public GitHub repository.
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { randomBytes } from 'node:crypto';
import { passwordHash } from '../lib/password.mjs';
const rl=createInterface({input:stdin,output:stdout});
try {
  const url=(await rl.question('Your BotHost website URL (https://...): ')).trim().replace(/\/$/,'');
  const uri=new URL(url);
  if(uri.protocol!=='https:' || uri.origin!==url)throw Error('Use the exact https:// domain with no path, query, or final slash.');
  const login=(await rl.question('Admin login [englishstep]: ')).trim()||'englishstep';
  if(!/^[a-zA-Z0-9_.@-]{3,80}$/.test(login))throw Error('Admin login must contain 3-80 Latin letters/digits/_.@-');
  const password=randomBytes(18).toString('base64url');
  const hash=await passwordHash(password);
  console.log('\nCopy these values into BotHost > Environment variables:');
  console.log('PUBLIC_URL='+uri.origin);
  console.log('ADMIN_LOGIN='+login);
  console.log('ADMIN_PASSWORD_HASH='+hash);
  console.log('DATA_DIR=/app/data');
  console.log('\nPORT: select 3000 in BotHost port settings.');
  console.log('\nYour initial password (save privately): '+password);
  console.log('NEVER push these credentials to GitHub or share them in screenshots.');
} catch(e){console.error(e.message);process.exitCode=1} finally {rl.close()}
