import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/lib/config.js';

test('derives siteUrl and sitemap from domain', () => {
  const cfg = loadConfig({ flags: { domain: 'Example.com' }, env: {} });
  assert.equal(cfg.domain, 'example.com');
  assert.equal(cfg.siteUrl, 'https://example.com/');
  assert.deepEqual(cfg.sitemaps, ['https://example.com/sitemap.xml']);
  assert.equal(cfg.dns.provider, 'manual');
});

test('derives apex domain from a www site URL', () => {
  const cfg = loadConfig({ flags: { 'site-url': 'https://www.example.org/blog' }, env: {} });
  assert.equal(cfg.domain, 'example.org');
  assert.equal(cfg.siteUrl, 'https://www.example.org/');
});

test('flags beat env, env beats defaults', () => {
  const cfg = loadConfig({
    flags: { domain: 'a.dev', dns: 'vercel' },
    env: { SEO_DOMAIN: 'b.dev', SEO_DNS_PROVIDER: 'cloudflare', GA_ACCOUNT_ID: '42', SEO_OWNER_EMAILS: 'x@y.com, z@y.com' },
  });
  assert.equal(cfg.domain, 'a.dev');
  assert.equal(cfg.dns.provider, 'vercel');
  assert.equal(cfg.dns.waitSeconds, 300);
  assert.equal(cfg.googleAnalytics.accountId, '42');
  assert.deepEqual(cfg.owners, ['x@y.com', 'z@y.com']);
});

test('rejects nonsense domains', () => {
  assert.throws(() => loadConfig({ flags: { domain: 'not a domain' }, env: {} }));
  assert.throws(() => loadConfig({ env: {} }), /Missing "domain"/);
});
