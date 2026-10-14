import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
export async function passwordHash(password,salt=randomBytes(16).toString('hex')){const result=await derive(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return `${salt}:${result.toString('hex')}`}
export async function verifyPassword(password,hash){if(typeof password!=='string'||password.length>256)return false;const [salt,expected]=hash.split(':');const actual=(await passwordHash(password,salt)).split(':')[1];return timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'))}
