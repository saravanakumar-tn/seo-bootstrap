import { readFileSync, existsSync } from 'node:fs';

export const DEFAULTS = {
  dns: { provider: 'manual', waitSeconds: 300 },
  owners: [],
  preflight: { enabled: true },
  googleSearchConsole: { enabled: true },
  googleAnalytics: {
    enabled: true,
    timeZone: 'Etc/UTC',
    currencyCode: 'USD',
    industryCategory: 'OTHER',
    dataRetention: 'FOURTEEN_MONTHS',
  },
  bing: { enabled: true },
  indexNow: { enabled: true, keyFileDir: null },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

// Precedence: defaults < config file < environment < CLI flags.
export function loadConfig({ file, flags = {}, env = process.env } = {}) {
  let fromFile = {};
  if (file) {
    if (!existsSync(file)) throw new Error(`Config file not found: ${file}`);
    fromFile = JSON.parse(readFileSync(file, 'utf8'));
  }

  const fromEnv = {
    ...(env.SEO_DOMAIN && { domain: env.SEO_DOMAIN }),
    ...(env.SEO_SITE_URL && { siteUrl: env.SEO_SITE_URL }),
    ...(env.SEO_DNS_PROVIDER && { dns: { provider: env.SEO_DNS_PROVIDER } }),
    ...(env.SEO_OWNER_EMAILS && { owners: splitList(env.SEO_OWNER_EMAILS) }),
    ...(env.GA_ACCOUNT_ID && { googleAnalytics: { accountId: env.GA_ACCOUNT_ID } }),
  };

  const fromFlags = {
    ...(flags.domain && { domain: flags.domain }),
    ...(flags['site-url'] && { siteUrl: flags['site-url'] }),
    ...(flags.dns && { dns: { provider: flags.dns } }),
    ...(flags.sitemap && { sitemaps: splitList(flags.sitemap) }),
  };

  const cfg = merge(merge(merge(DEFAULTS, fromFile), fromEnv), fromFlags);
  return finalise(cfg);
}

export function finalise(cfg) {
  if (!cfg.domain && cfg.siteUrl) cfg.domain = new URL(cfg.siteUrl).hostname.replace(/^www\./, '');
  if (!cfg.domain) throw new Error('Missing "domain" (e.g. example.com). Pass --domain or set it in the config file.');

  cfg.domain = cfg.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cfg.domain)) throw new Error(`"${cfg.domain}" doesn't look like a domain`);

  cfg.siteUrl ??= `https://${cfg.domain}/`;
  const u = new URL(cfg.siteUrl);
  cfg.siteUrl = `${u.origin}/`; // Bing and GA want the origin with trailing slash
  cfg.sitemaps = cfg.sitemaps?.length ? cfg.sitemaps : [`${u.origin}/sitemap.xml`];
  cfg.googleAnalytics.propertyName ??= cfg.domain;
  return cfg;
}

export function splitList(v) {
  return String(v)
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
