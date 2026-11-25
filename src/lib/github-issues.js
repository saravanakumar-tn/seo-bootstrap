// Turns findings into GitHub issues so they can be worked on later.
// Dedup: each issue body carries a hidden marker <!-- seo-bootstrap:<key> -->; if an OPEN issue
// with that marker exists we add a comment only when its content changed, instead of opening a new one.
//
// Needs GITHUB_TOKEN (issues: write) and GITHUB_REPOSITORY=owner/repo. In GitHub Actions both are
// available automatically; locally pass --issues-repo owner/repo and a token.

import { request } from './http.js';
import { KINDS } from './findings.js';

const API = 'https://api.github.com';
const BASE_LABEL = 'seo-bootstrap';

export function marker(key) {
  return `<!-- seo-bootstrap:${key} -->`;
}

export function issueTitle(domain, f) {
  return `[seo] ${domain}: ${f.title}`;
}

export function issueBody(domain, f, runUrl) {
  const k = KINDS[f.kind];
  return [
    marker(f.key),
    `**${k.emoji} ${k.heading}** — ${f.service} — \`${domain}\``,
    '',
    f.body,
    '',
    '---',
    runUrl ? `Reported by [this run](${runUrl}) of seo-bootstrap.` : 'Reported by seo-bootstrap.',
    'Close this issue when it is handled. Re-running the setup is safe; it will reopen a new issue only if the problem is still there.',
  ].join('\n');
}

export async function reportFindings(findings, { domain, env = process.env, repo, dryRun = false, log = console.log } = {}) {
  repo ??= env.SEO_ISSUES_REPO || env.GITHUB_REPOSITORY;
  const token = env.SEO_ISSUES_TOKEN || env.GITHUB_TOKEN;
  if (!findings.length) return [];
  if (!repo || !token) {
    log('issues: skipped (set GITHUB_TOKEN and GITHUB_REPOSITORY or --issues-repo to enable)');
    return [];
  }
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null;

  if (dryRun) {
    findings.forEach((f) => log(`issues: would open/update "${issueTitle(domain, f)}" in ${repo}`));
    return [];
  }

  const gh = (path, opts = {}) =>
    request(`${API}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });

  await ensureLabels(gh, repo, findings);

  const open = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`/repos/${repo}/issues?state=open&labels=${BASE_LABEL}&per_page=100&page=${page}`);
    open.push(...batch);
    if (batch.length < 100) break;
  }

  const results = [];
  for (const f of findings) {
    const body = issueBody(domain, f, runUrl);
    const existing = open.find((i) => i.body?.includes(marker(f.key)));
    if (existing) {
      const unchanged = existing.body?.replace(/Reported by .*\n/, '') === body.replace(/Reported by .*\n/, '');
      if (!unchanged) {
        await gh(`/repos/${repo}/issues/${existing.number}/comments`, {
          method: 'POST',
          body: { body: `Still open on the latest run. Updated details:\n\n${f.body}${runUrl ? `\n\n[Run](${runUrl})` : ''}` },
        });
      }
      log(`issues: #${existing.number} already tracks "${f.title}"`);
      results.push({ key: f.key, number: existing.number, action: 'existing', url: existing.html_url });
      continue;
    }
    const created = await gh(`/repos/${repo}/issues`, {
      method: 'POST',
      body: { title: issueTitle(domain, f), body, labels: [BASE_LABEL, KINDS[f.kind].label] },
    });
    log(`issues: opened #${created.number} "${f.title}"`);
    results.push({ key: f.key, number: created.number, action: 'created', url: created.html_url });
  }
  return results;
}

async function ensureLabels(gh, repo, findings) {
  const wanted = new Map([[BASE_LABEL, '5319e7']]);
  const colours = { exists: 'c5def5', manual: 'fbca04', failed: 'd73a4a' };
  for (const f of findings) wanted.set(KINDS[f.kind].label, colours[f.kind]);
  for (const [name, color] of wanted) {
    try {
      await gh(`/repos/${repo}/labels`, { method: 'POST', body: { name, color }, retries: 0 });
    } catch (err) {
      if (err.status !== 422) throw err; // 422 = label already exists
    }
  }
}
