import { AccessError } from '../developer/common.js';
const basic=new Set(Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'));
const extended=new Set(Array.from('\f^{}\\[~]|€'));
export function estimateSegments(value:unknown) {
  if(typeof value!=='string'||value.length===0||value.length>1600||!value.trim())throw new AccessError(400,'Message must contain text and be at most 1600 UTF-16 units');
  let gsm=true,units=0;
  for(const character of value){
    const point=character.codePointAt(0)!;
    if((point>=0xd800&&point<=0xdfff)||/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(character))throw new AccessError(400,'Message contains unsupported control characters or invalid Unicode');
    if(basic.has(character))units++;
    else if(extended.has(character))units+=2;
    else gsm=false;
  }
  if(!gsm)units=value.length;
  const single=gsm?160:70,multipart=gsm?153:67;
  let segments=1;
  if(units>single){
    let occupied=0;
    for(const character of value){
      const cost=gsm?(extended.has(character)?2:1):character.length;
      if(occupied+cost>multipart){segments++;occupied=0;}
      occupied+=cost;
    }
  }
  if(segments>10)throw new AccessError(400,'Message exceeds the pilot limit of 10 SMS segments');
  return {encoding:gsm?'GSM-7' as const:'UTF-16' as const,units,segments};
}
