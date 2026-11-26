import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, validPassword, validUsername } from '../src/auth/security.js';
test('password hashes are salted, one way, and reject wrong/absent credentials',async()=>{
  const password='a long test-only password';
  const first=await hashPassword(password), second=await hashPassword(password);
  assert.notEqual(first,second);assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password,first),true);
  assert.equal(await verifyPassword('wrong',first),false);
  assert.equal(await verifyPassword(password,undefined),false);
  assert.equal(await verifyPassword(password,'malformed'),false);
  assert.equal(validPassword('short'),false);assert.equal(validPassword('x'.repeat(129)),false);
  assert.equal(validUsername('admin_user'),true);assert.equal(validUsername('Admin user'),false);
});
