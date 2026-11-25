import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/lib/config.js';
import ga4 from '../src/steps/analytics.js';
import bing from '../src/steps/bing.js';
import gsc from '../src/steps/search-console.js';
import preflight from '../src/steps/preflight.js';
import { mockFetch, silent } from './helpers.js';

before(() => {
  Object.assign(process.env, { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', GOOGLE_REFRESH_TOKEN: 'r' });
});
const token = ['POST', /oauth2\.googleapis\.com\/token/, () => ({ access_token: 'at', expires_in: 3600 })];
const cfg = () => loadConfig({ flags: { domain: 'ex.com' }, env: { GA_ACCOUNT_ID: '1' } });
const noDns = { ensureRecord: async () => ({ action: 'exists' }) };

test('GA4 reuses an existing property whose stream matches the host', async () => {
  const m = mockFetch([
    token,
    ['GET', /\/accounts\?/, () => ({ accounts: [{ name: 'accounts/1', displayName: 'Me' }] })],
    ['GET', /\/properties\?filter/, () => ({ properties: [{ name: 'properties/9', displayName: 'Old name', timeZone: 'Asia/Kolkata', currencyCode: 'INR' }] })],
    ['GET', /properties\/9\/dataStreams/, () => ({ dataStreams: [{ type: 'WEB_DATA_STREAM', webStreamData: { defaultUri: 'https://www.ex.com', measurementId: 'G-OLD' } }] })],
    ['PATCH', /dataRetentionSettings/, () => ({})],
  ]);
  try {
    const r = await ga4.run({ cfg: cfg(), log: silent });
    assert.equal(r.outputs.measurement_id, 'G-OLD');
    assert.equal(r.findings[0].kind, 'exists');
    assert.ok(!m.calls.some((c) => c.method === 'POST' && c.url.endsWith('/properties')), 'no duplicate property created');
  } finally {
    m.restore();
  }
});

test('GA4 creates property + stream when none exists', async () => {
  const m = mockFetch([
    token,
    ['GET', /\/accounts\?/, () => ({ accounts: [{ name: 'accounts/1' }] })],
    ['GET', /\/properties\?filter/, () => ({})],
    ['POST', /\/v1beta\/properties$/, () => ({ name: 'properties/5' })],
    ['POST', /properties\/5\/dataStreams$/, () => ({ webStreamData: { measurementId: 'G-NEW' } })],
    ['PATCH', /dataRetentionSettings/, () => ({})],
  ]);
  try {
    const r = await ga4.run({ cfg: cfg(), log: silent });
    assert.equal(r.outputs.measurement_id, 'G-NEW');
    assert.equal(r.findings.length, 0);
  } finally {
    m.restore();
  }
});

test('GA4 raises a manual finding when the account is missing', async () => {
  const m = mockFetch([token, ['GET', /\/accounts\?/, () => ({ accounts: [] })]]);
  try {
    const r = await ga4.run({ cfg: cfg(), log: silent });
    assert.equal(r.status, 'pending');
    assert.equal(r.findings[0].key, 'ex.com:ga4:account');
  } finally {
    m.restore();
  }
});

test('Search Console: existing verified property skips verification', async () => {
  const m = mockFetch([
    token,
    ['GET', /webmasters\/v3\/sites$/, () => ({ siteEntry: [{ siteUrl: 'sc-domain:ex.com', permissionLevel: 'siteOwner' }] })],
    ['GET', /\/sitemaps$/, () => ({ sitemap: [{ path: 'https://ex.com/old.xml' }] })],
    ['PUT', /\/sitemaps\//, () => ({})],
  ]);
  try {
    const r = await gsc.run({ cfg: cfg(), dns: noDns, waitForRecord: async () => true, log: silent });
    assert.equal(r.status, 'done');
    assert.deepEqual(r.findings.map((f) => f.kind), ['exists']);
    assert.ok(!m.calls.some((c) => c.url.includes('siteVerification')));
  } finally {
    m.restore();
  }
});

test('Bing: existing verified site only resubmits sitemaps', async () => {
  const m = mockFetch([
    ['GET', /GetUserSites/, () => ({ d: [{ Url: 'https://ex.com', IsVerified: true }] })],
    ['POST', /SubmitFeed/, () => ({ d: null })],
  ]);
  try {
    const r = await bing.run({ cfg: cfg(), env: { BING_API_KEY: 'k' }, dns: noDns, waitForRecord: async () => true, log: silent });
    assert.equal(r.status, 'done');
    assert.equal(r.findings[0].key, 'ex.com:bing:exists');
    assert.ok(!m.calls.some((c) => /AddSite|VerifySite/.test(c.url)));
  } finally {
    m.restore();
  }
});

test('preflight flags noindex and a missing sitemap line', async () => {
  const pages = {
    'https://ex.com/': [200, '<meta name="robots" content="noindex">'],
    'https://ex.com/robots.txt': [200, 'User-agent: *\nAllow: /'],
    'https://ex.com/sitemap.xml': [200, '<urlset></urlset>'],
  };
  const fetchImpl = async (u) => new Response(pages[u][1], { status: pages[u][0] });
  const r = await preflight.run({ cfg: cfg(), log: silent, fetchImpl });
  assert.equal(r.status, 'warn');
  assert.equal(r.details.warnings.length, 2);
  assert.equal(r.findings[0].kind, 'manual');
});
