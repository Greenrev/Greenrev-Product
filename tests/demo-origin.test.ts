import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDemoOrigin } from '../src/demo/request-origin.js';

test('local demo uses the actual browser host when Next normalises its internal URL', () => {
  for (const host of ['127.0.0.1:3100', 'localhost:3100', '[::1]:3100']) {
    const request = new Request('http://localhost:3100/api/saas/demo/session', { headers: { Host: host } });
    assert.equal(resolveDemoOrigin(request), 'http://' + host);
  }
});
test('local origin resolution refuses external hosts, misleading localhost suffixes and wrong ports', () => {
  for (const host of ['attacker.example:3100', 'localhost.attacker.example:3100', '127.0.0.1:9999', 'user@localhost:3100', 'localhost:3100/bad']) {
    assert.throws(() => resolveDemoOrigin(new Request('http://localhost:3100/api/saas/session', { headers: { Host: host } })));
  }
});
test('explicitly configured demo origins stay pinned and browser Origin is not accepted as authority', () => {
  const req = new Request('http://localhost:3100/api/saas/demo/session', { headers: { Host: '127.0.0.1:3100', Origin: 'https://attacker.example' } });
  assert.equal(resolveDemoOrigin(req), 'http://127.0.0.1:3100');
  assert.equal(resolveDemoOrigin(req, 'https://configured.example'), 'https://configured.example');
  assert.throws(() => resolveDemoOrigin(req, 'https://user@configured.example/'));
});
