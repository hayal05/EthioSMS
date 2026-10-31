import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone,checkDestination,validScopes } from '../src/developer/common.js';
test('normalizes Ethiopian mobile formats and rejects ambiguous or disallowed destinations',()=>{
  for(const value of ['0912345678','912345678','251912345678','+251912345678','00251912345678','09 1234-5678'])assert.equal(normalizePhone(value),'+251912345678');
  assert.equal(normalizePhone('0712345678'),'+251712345678');
  for(const value of ['09123','+251112345678','+2510912345678','abc','+12+3456789',{},null])assert.throws(()=>normalizePhone(value));
  assert.throws(()=>checkDestination('+14155552671',['+251']));checkDestination('+251912345678',['+251']);
  assert.equal(validScopes(['usage:read']),true);assert.equal(validScopes(['admin']),false);assert.equal(validScopes(['usage:read','usage:read']),false);assert.equal(validScopes([]),false);
});
