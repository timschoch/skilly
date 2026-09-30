import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJwt, createManifest, findApp, setApp } from '../lib/github-app.js';

const folder = () => mkdtempSync(join(tmpdir(), 'skilly-app-'));

test('findApp: no config for the owner is null', () => assert.equal(findApp('someone', folder()), null));

test('setApp then findApp: config per owner', () => {
  const configDir = folder();
  setApp('acme', { id: 7, slug: 'skilly-acme', keyPath: '/keys/acme.pem' }, configDir);
  assert.deepEqual(findApp('acme', configDir), { id: 7, slug: 'skilly-acme', keyPath: '/keys/acme.pem' });
  assert.equal(findApp('other', configDir), null);
});

test('createJwt: RS256 signed by the App key, issued by the App id', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPath = join(folder(), 'app.pem');
  writeFileSync(keyPath, privateKey.export({ type: 'pkcs1', format: 'pem' }));
  const jwt = createJwt({ id: 42, keyPath }, 1000);
  const [header, payload, signature] = jwt.split('.');
  const parsePart = (part) => JSON.parse(Buffer.from(part, 'base64url').toString());
  assert.deepEqual(parsePart(header), { alg: 'RS256', typ: 'JWT' });
  assert.deepEqual(parsePart(payload), { iat: 940, exp: 1540, iss: '42' });
  const verified = createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(publicKey, signature, 'base64url');
  assert.equal(verified, true);
});

test('createManifest: private App with the sync and release rights, no webhook', () => {
  const manifest = createManifest('acme', 'http://127.0.0.1:1234/callback');
  assert.equal(manifest.name, 'skilly-acme');
  assert.equal(manifest.public, false);
  assert.equal(manifest.redirect_url, 'http://127.0.0.1:1234/callback');
  assert.deepEqual(manifest.default_permissions, { contents: 'write', pull_requests: 'write' });
  assert.equal(manifest.hook_attributes.active, false);
});

test('createManifest: name stays within GitHub 34-character limit', () => {
  assert.equal(createManifest('a-very-long-organisation-name-here', 'x').name.length, 34);
});
