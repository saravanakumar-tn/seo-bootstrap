#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { appendFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.js';
import { googleAuthMode } from './lib/google-auth.js';
import { getDnsProvider } from './dns/index.js';
import { waitForRecord } from './lib/dns-check.js';
import { finding } from './lib/findings.js';
import { reportFindings } from './lib/github-issues.js';
import preflight from './steps/preflight.js';
import gsc from './steps/search-console.js';
import ga4 from './steps/analytics.js';
import bing from './steps/bing.js';
import indexnow from './steps/indexnow.js';

export const STEPS = [preflight, gsc, ga4, bing, indexnow];
const GOOGLE_STEPS = new Set(['gsc', 'ga4']);

const HELP = `seo-bootstrap — register a website with Search Console, GA4, Bing and IndexNow

Usage:
  seo-bootstrap setup [options]     run every enabled step
  seo-bootstrap plan  [options]     show what would happen (no API writes)

Options:
  --config <file>        JSON config (default: seo.config.json if present)
  --domain <domain>      e.g. example.com
  --site-url <url>       canonical origin, e.g. https://www.example.com/
  --dns <provider>       cloudflare | vercel | manual
  --sitemap <urls>       comma-separated sitemap URLs
  --only <ids>           comma-separated: preflight,gsc,ga4,bing,indexnow
  --skip <ids>           comma-separated steps to skip
  --issues-repo <o/r>    open GitHub issues here (default: $GITHUB_REPOSITORY)
  --no-issues            don't open GitHub issues
  --output <file>        results JSON (default: seo-output.json)
  --no-fail              exit 0 even if a step failed
`;

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { values: flags, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      domain: { type: 'string' },
      'site-url': { type: 'string' },
      dns: { type: 'string' },
      sitemap: { type: 'string' },
      only: { type: 'string' },
      skip: { type: 'string' },
      'issues-repo': { type: 'string' },
      'no-issues': { type: 'boolean', default: false },
      output: { type: 'string', default: 'seo-output.json' },
      'no-fail': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const command = positionals[0] ?? 'help';
  if (flags.help || command === 'help') return void console.log(HELP);
  if (!['setup', 'plan'].includes(command)) throw new Error(`Unknown command "${command}"\n\n${HELP}`);

  const file = flags.config ?? (existsSync('seo.config.json') ? 'seo.config.json' : undefined);
  const cfg = loadConfig({ file, flags, env });
  const only = flags.only?.split(',');
  const skip = new Set(flags.skip?.split(',') ?? []);
  const steps = STEPS.filter((s) => s.enabled(cfg) && (!only || only.includes(s.id)) && !skip.has(s.id));
  const dryRun = command === 'plan';
  const log = (m) => console.log(m);

  log(`seo-bootstrap ${dryRun ? 'plan' : 'setup'} for ${cfg.domain} (${cfg.siteUrl}), DNS: ${cfg.dns.provider}`);

  if (dryRun) {
    for (const s of steps) {
      log(`\n▸ ${s.title}`);
      s.plan(cfg).forEach((l) => log(`  - ${l}`));
    }
    log(`\nCredentials: google=${googleAuthMode(env) ?? 'MISSING'}, bing=${env.BING_API_KEY ? 'ok' : 'MISSING'}, issues=${(env.GITHUB_TOKEN || env.SEO_ISSUES_TOKEN) && !flags['no-issues'] ? 'on' : 'off'}`);
    return { results: [] };
  }

  const needsDns = steps.some((s) => ['gsc', 'bing'].includes(s.id));
  const dns = needsDns ? getDnsProvider(cfg.dns.provider, { domain: cfg.domain, env, log }) : null;

  const results = [];
  const outputs = {};
  for (const step of steps) {
    log(`\n▸ ${step.title}`);
    if (GOOGLE_STEPS.has(step.id) && !googleAuthMode(env)) {
      const f = finding({
        key: `${cfg.domain}:google:creds`,
        kind: 'manual',
        service: 'Google',
        title: 'Google credentials missing',
        body: '- [ ] Follow docs/PREREQUISITES.md → Google, then add the secrets and re-run',
      });
      results.push({ id: step.id, title: step.title, status: 'skipped', findings: [f] });
      log('  skipped: no Google credentials');
      continue;
    }
    try {
      const r = await step.run({ cfg, env, dns, waitForRecord, log });
      Object.assign(outputs, r.outputs);
      results.push({ id: step.id, title: step.title, ...r, findings: r.findings ?? [] });
      log(`  → ${r.status}`);
    } catch (err) {
      log(`  ✗ ${err.message}`);
      results.push({
        id: step.id,
        title: step.title,
        status: 'failed',
        error: err.message,
        findings: [
          finding({
            key: `${cfg.domain}:${step.id}:failed`,
            kind: 'failed',
            service: step.title,
            title: `${step.title} setup failed`,
            body: `\`\`\`\n${err.message}\n\`\`\`\n\n- [ ] Fix the cause and re-run (all steps are idempotent)`,
          }),
        ],
      });
    }
  }

  // De-duplicate findings by key (e.g. the Google creds one is raised by two steps).
  const findings = [...new Map(results.flatMap((r) => r.findings).map((f) => [f.key, f])).values()];
  let issues = [];
  if (!flags['no-issues'] && findings.length) {
    log('\n▸ GitHub issues');
    try {
      issues = await reportFindings(findings, { domain: cfg.domain, env, repo: flags['issues-repo'], log });
    } catch (err) {
      log(`  ✗ could not open issues: ${err.message}`);
    }
  }

  const summary = { domain: cfg.domain, siteUrl: cfg.siteUrl, outputs, results: results.map(({ findings, ...r }) => r), findings, issues };
  writeFileSync(flags.output, JSON.stringify(summary, null, 2));
  writeGitHubOutputs(env, outputs, summary);
  printSummary(summary, log);

  const failed = results.some((r) => r.status === 'failed');
  if (failed && !flags['no-fail']) process.exitCode = 1;
  return summary;
}

function writeGitHubOutputs(env, outputs, summary) {
  if (env.GITHUB_OUTPUT) {
    const lines = Object.entries(outputs).map(([k, v]) => `${k}=${v}`);
    lines.push(`issues=${summary.issues.map((i) => i.url).join(',')}`);
    appendFileSync(env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  }
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, markdownSummary(summary));
}

const ICON = { done: '✅', pending: '⏳', warn: '⚠️', skipped: '⏭️', failed: '❌' };

export function markdownSummary(s) {
  const rows = s.results.map((r) => `| ${r.title} | ${ICON[r.status] ?? ''} ${r.status} |`).join('\n');
  const out = Object.entries(s.outputs).map(([k, v]) => `- **${k}**: \`${v}\``).join('\n');
  const iss = s.issues.map((i) => `- #${i.number} (${i.action})`).join('\n');
  return `## SEO setup: ${s.domain}\n\n| Service | Status |\n|---|---|\n${rows}\n\n${out ? `### Outputs\n${out}\n\n` : ''}${iss ? `### Follow-up issues\n${iss}\n` : ''}`;
}

function printSummary(s, log) {
  log('\n──────── summary ────────');
  s.results.forEach((r) => log(`${ICON[r.status] ?? ' '} ${r.title.padEnd(24)} ${r.status}`));
  Object.entries(s.outputs).forEach(([k, v]) => log(`   ${k}: ${v}`));
  if (s.findings.length) log(`   ${s.findings.length} follow-up item(s)${s.issues.length ? `, ${s.issues.length} GitHub issue(s)` : ''}`);
}

const isMain = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
