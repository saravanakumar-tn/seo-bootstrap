#!/usr/bin/env node
// One-time helper: gets a Google OAuth refresh token for your own account.
//
//   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run auth:google
//
// Create the client in Google Cloud Console -> APIs & Services -> Credentials ->
// "OAuth client ID" -> Application type "Desktop app". Store the printed refresh
// token as the GOOGLE_REFRESH_TOKEN secret. Never commit it.

import { createServer } from 'node:http';
import { GOOGLE_SCOPES } from '../src/lib/google-auth.js';
import { request } from '../src/lib/http.js';

const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first (Desktop-app OAuth client).');
  process.exit(1);
}

const port = Number(process.env.AUTH_PORT ?? 53682);
const redirectUri = `http://127.0.0.1:${port}/callback`;

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: GOOGLE_SCOPES.join(' '),
  access_type: 'offline',
  prompt: 'consent', // forces a refresh token even if you authorised before
}).toString();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  if (url.pathname !== '/callback') return res.writeHead(404).end();
  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400).end(`Authorisation failed: ${url.searchParams.get('error')}`);
    return;
  }
  try {
    const tokens = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Done. You can close this tab and return to the terminal.');
    console.log('\nGOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('\nSave it as a secret, e.g.:  gh secret set GOOGLE_REFRESH_TOKEN');
  } catch (err) {
    res.writeHead(500).end(String(err));
    console.error(err);
  } finally {
    server.close();
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('Open this URL in your browser and approve access:\n');
  console.log(authUrl.toString());
});
