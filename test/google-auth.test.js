import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { signJwt, googleAuthMode, GOOGLE_SCOPES } from '../src/lib/google-auth.js';

test('signs a verifiable RS256 service-account JWT', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = { client_email: 'bot@p.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const jwt = signJwt(sa, 1_700_000_000);
  const [h, c, sig] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.iss, sa.client_email);
  assert.equal(claims.scope, GOOGLE_SCOPES.join(' '));
  assert.equal(claims.exp - claims.iat, 3600);
  const v = createVerify('RSA-SHA256');
  v.update(`${h}.${c}`);
  assert.ok(v.verify(publicKey, sig, 'base64url'));
});

test('auth mode detection', () => {
  assert.equal(googleAuthMode({}), null);
  assert.equal(googleAuthMode({ GOOGLE_SERVICE_ACCOUNT_JSON: '{}' }), 'service-account');
  assert.equal(googleAuthMode({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', GOOGLE_REFRESH_TOKEN: 'c' }), 'oauth');
  assert.equal(googleAuthMode({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }), null);
});
