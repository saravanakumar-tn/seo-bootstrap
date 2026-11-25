import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportFindings, marker } from '../src/lib/github-issues.js';
import { finding } from '../src/lib/findings.js';
import { mockFetch, silent } from './helpers.js';

const env = { GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'me/site' };
const f1 = finding({ key: 'ex.com:ga4:exists', kind: 'exists', service: 'GA4', title: 'GA4 property already exists', body: 'details A' });
const f2 = finding({ key: 'ex.com:bing:verify', kind: 'manual', service: 'Bing', title: 'Finish Bing verification', body: 'do X' });

test('opens new issues and reuses open ones with the same marker', async () => {
  const created = [];
  const m = mockFetch([
    ['POST', /\/labels$/, () => ({ __status: 422, __json: { message: 'exists' } })],
    ['GET', /\/issues\?state=open/, () => [{ number: 7, html_url: 'u7', body: `${marker(f1.key)}\nold` }]],
    ['POST', /\/issues\/7\/comments$/, () => ({ id: 1 })],
    ['POST', /\/issues$/, (_u, b) => (created.push(b), { number: 8, html_url: 'u8' })],
  ]);
  try {
    const res = await reportFindings([f1, f2], { domain: 'ex.com', env, log: silent });
    assert.deepEqual(res.map((r) => [r.number, r.action]), [[7, 'existing'], [8, 'created']]);
    assert.equal(created.length, 1);
    assert.equal(created[0].title, '[seo] ex.com: Finish Bing verification');
    assert.deepEqual(created[0].labels, ['seo-bootstrap', 'seo:manual-step']);
    assert.ok(created[0].body.startsWith(marker(f2.key)));
    assert.ok(m.calls.some((c) => c.url.endsWith('/issues/7/comments')), 'changed details get a comment');
  } finally {
    m.restore();
  }
});

test('does nothing without a token', async () => {
  const res = await reportFindings([f1], { domain: 'ex.com', env: {}, log: silent });
  assert.deepEqual(res, []);
});
