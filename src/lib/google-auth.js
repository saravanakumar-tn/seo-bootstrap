// Google access tokens without the googleapis SDK.
// Two modes:
//   1. OAuth user (recommended for personal use): GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN
//      Properties end up owned by YOUR Google account, so they show up in the Search Console / GA UI directly.
//   2. Service account (good for teams/CI): GOOGLE_SERVICE_ACCOUNT_JSON (file path or raw JSON)
//      The service account becomes the verified owner; human owners are added via SEO_OWNER_EMAILS.

import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { request } from './http.js';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/siteverification',
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/analytics.edit',
];

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

let cached = null;

export function googleAuthMode(env = process.env) {
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) return 'service-account';
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN) return 'oauth';
  return null;
}

export async function getGoogleAccessToken(env = process.env) {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const mode = googleAuthMode(env);
  let res;
  if (mode === 'oauth') {
    res = await request(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
      }),
    });
  } else if (mode === 'service-account') {
    const sa = loadServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    res = await request(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signJwt(sa),
      }),
    });
  } else {
    throw new Error(
      'No Google credentials. Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN ' +
        '(run `npm run auth:google`) or GOOGLE_SERVICE_ACCOUNT_JSON. See docs/PREREQUISITES.md.',
    );
  }

  cached = { token: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
  return cached.token;
}

export function loadServiceAccount(value) {
  const text = value.trim().startsWith('{') ? value : existsSync(value) ? readFileSync(value, 'utf8') : null;
  if (!text) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is neither JSON nor an existing file path');
  const sa = JSON.parse(text);
  if (!sa.client_email || !sa.private_key) throw new Error('Service account JSON is missing client_email/private_key');
  return sa;
}

export function signJwt(sa, now = Math.floor(Date.now() / 1000)) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const claims = b64({
    iss: sa.client_email,
    scope: GOOGLE_SCOPES.join(' '),
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  });
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(sa.private_key, 'base64url')}`;
}

export async function google(url, opts = {}) {
  const token = await getGoogleAccessToken();
  return request(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) } });
}
