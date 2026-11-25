// Read-only sanity checks. Never fails the run; it just warns about things that block indexing.
import { finding } from '../lib/findings.js';

export default {
  id: 'preflight',
  title: 'Preflight checks',
  enabled: (cfg) => cfg.preflight.enabled,
  plan: (cfg) => [`GET ${cfg.siteUrl}, robots.txt and ${cfg.sitemaps.join(', ')}; check for noindex`],

  async run({ cfg, log, fetchImpl = fetch }) {
    const warnings = [];
    const get = async (url) => {
      try {
        const res = await fetchImpl(url, { redirect: 'follow', headers: { 'User-Agent': 'seo-bootstrap' } });
        return { ok: res.ok, status: res.status, headers: res.headers, text: await res.text() };
      } catch (err) {
        return { ok: false, status: 0, text: '', error: err.message };
      }
    };

    const home = await get(cfg.siteUrl);
    if (!home.ok) warnings.push(`Homepage ${cfg.siteUrl} returned ${home.status || home.error}`);
    else {
      const robotsHeader = home.headers.get('x-robots-tag') ?? '';
      if (/noindex/i.test(robotsHeader)) warnings.push('Homepage sends "X-Robots-Tag: noindex"');
      if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(home.text)) warnings.push('Homepage has <meta name="robots" content="noindex">');
    }

    const robots = await get(new URL('/robots.txt', cfg.siteUrl).href);
    if (!robots.ok) warnings.push('No robots.txt (add one with a "Sitemap:" line)');
    else {
      if (/^\s*disallow:\s*\/\s*$/im.test(robots.text) && !/^\s*allow:/im.test(robots.text))
        warnings.push('robots.txt contains "Disallow: /" — the whole site is blocked');
      if (!/^\s*sitemap:/im.test(robots.text)) warnings.push('robots.txt has no "Sitemap:" line');
    }

    for (const sm of cfg.sitemaps) {
      const res = await get(sm);
      if (!res.ok) warnings.push(`Sitemap ${sm} returned ${res.status || res.error}`);
      else if (!/<(urlset|sitemapindex)/i.test(res.text)) warnings.push(`Sitemap ${sm} doesn't look like sitemap XML`);
    }

    warnings.forEach((w) => log(`  warn: ${w}`));
    const findings = warnings.length
      ? [
          finding({
            key: `${cfg.domain}:preflight`,
            kind: 'manual',
            service: 'Preflight',
            title: 'Site has indexing blockers',
            body: `The site isn't ready for search engines yet:\n\n${warnings.map((w) => `- [ ] ${w}`).join('\n')}`,
          }),
        ]
      : [];
    return { status: warnings.length ? 'warn' : 'done', details: { warnings }, findings };
  },
};
