import { createHash, randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export const digest = (value:string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export function validUsername(value:unknown): value is string { return typeof value === 'string' && /^[a-z0-9][a-z0-9_.-]{2,79}$/.test(value); }
export function validPassword(value:unknown): value is string { return typeof value === 'string' && value.length >= 12 && value.length <= 128; }
export async function hashPassword(password:string):Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password,salt,64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
// A syntactically valid dummy hash ensures unknown users still incur password derivation.
const dummy = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
export async function verifyPassword(password:string, encoded?:string|null):Promise<boolean> {
  const value = encoded && /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded) ? encoded : dummy;
  const [,salt,key] = value.split(':');
  const derived = await scrypt(password,salt!,64) as Buffer;
  return timingSafeEqual(derived,Buffer.from(key!,'hex')) && !!encoded && value !== dummy;
}
