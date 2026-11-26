export class AccessError extends Error {
  constructor(public status:number, message:string) { super(message); }
}
export const uuid=(value:unknown):value is string=>typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export const scopes=['messages:send','messages:read','otp:request','otp:verify','usage:read'] as const;
export type Scope=typeof scopes[number];
export function validScopes(value:unknown):value is Scope[] {
  return Array.isArray(value) && value.length>0 && value.length<=scopes.length && new Set(value).size===value.length && value.every(item=>scopes.includes(item));
}
export const globalScopeId='00000000-0000-0000-0000-000000000000';
export function normalizePhone(value:unknown):string {
  if(typeof value!=='string' || value.length>40 || !/^[+0-9 ()-]+$/.test(value.trim())) throw new AccessError(400,'Invalid phone number');
  let number=value.trim().replace(/[ ()-]/g,'');
  if(/^0[79]\d{8}$/.test(number))number='+251'+number.slice(1);
  else if(/^[79]\d{8}$/.test(number))number='+251'+number;
  else if(/^251[79]\d{8}$/.test(number))number='+'+number;
  else if(number.startsWith('00'))number='+'+number.slice(2);
  if(!/^\+[1-9]\d{7,14}$/.test(number) || (number.startsWith('+251') && !/^\+251[79]\d{8}$/.test(number))) throw new AccessError(400,'Invalid phone number');
  return number;
}
export function checkDestination(number:string,prefixes:string[]) {
  if(!prefixes.some(prefix=>number.startsWith(prefix)))throw new AccessError(400,'Destination is not permitted');
}
