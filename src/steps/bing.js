// Bing Webmaster Tools: add site, verify via CNAME (<code>.<host> -> verify.bing.com), submit sitemaps.
// Existence check: GetUserSites; if the site is already there and verified we only (re)submit sitemaps
// and raise an "already exists" issue.

import { request, HttpError } from '../lib/http.js';
import { finding } from '../lib/findings.js';

const API = 'https://ssl.bing.com/webmaster/api.svc/json';

export default {
  id: 'bing',
  title: 'Bing Webmaster Tools',
  enabled: (cfg) => cfg.bing.enabled,
  plan: (cfg) => [
    `check whether ${cfg.siteUrl} is already in Bing Webmaster Tools`,
    `if not: AddSite, add CNAME <code>.${new URL(cfg.siteUrl).host} -> verify.bing.com, VerifySite`,
    `submit sitemaps: ${cfg.sitemaps.join(', ')}`,
  ],

  async run({ cfg, env, dns, waitForRecord, log }) {
    const key = env.BING_API_KEY;
    const findings = [];
    if (!key) {
      findings.push(
        finding({
          key: `${cfg.domain}:bing:apikey`,
          kind: 'manual',
          service: 'Bing Webmaster Tools',
          title: 'Bing API key missing',
          body: '- [ ] Sign in at https://www.bing.com/webmasters → Settings → API access → Generate API key (one per user, works for all sites)\n- [ ] Save it as the `BING_API_KEY` secret and re-run',
        }),
      );
      return { status: 'skipped', findings };
    }
    const bing = (method, body) =>
      request(`${API}/${method}?apikey=${encodeURIComponent(key)}`, body ? { method: 'POST', body } : {}).then((r) => r?.d ?? r);

    const sameSite = (u) => u?.replace(/\/?$/, '/').toLowerCase() === cfg.siteUrl.toLowerCase();

    // ---- existence check -------------------------------------------------
    let site = (await bing('GetUserSites'))?.find((s) => sameSite(s.Url));
    if (site) {
      log(`  ${cfg.siteUrl} already in Bing (verified: ${site.IsVerified})`);
      findings.push(
        finding({
          key: `${cfg.domain}:bing:exists`,
          kind: 'exists',
          service: 'Bing Webmaster Tools',
          title: 'Bing site already exists',
          body: `\`${site.Url}\` was already in Bing Webmaster Tools (verified: **${site.IsVerified}**).\n\n- [ ] Review users under Settings → User management\n- [ ] Check Sitemaps for stale entries`,
        }),
      );
    } else {
      await bing('AddSite', { siteUrl: cfg.siteUrl });
      site = (await bing('GetUserSites'))?.find((s) => sameSite(s.Url));
      log(`  added ${cfg.siteUrl}`);
    }

    // ---- verify ---------------------------------------------------------
    if (!site?.IsVerified) {
      const code = site?.DnsVerificationCode || site?.AuthenticationCode;
      const record = { type: 'CNAME', name: `${code}.${new URL(cfg.siteUrl).host}`, content: 'verify.bing.com' };
      await dns.ensureRecord(record);
      const visible = await waitForRecord(record, { timeoutSeconds: cfg.dns.waitSeconds, log });
      let ok = false;
      if (visible) {
        try {
          ok = Boolean(await bing('VerifySite', { siteUrl: cfg.siteUrl }));
        } catch (err) {
          if (!(err instanceof HttpError)) throw err;
          log(`  VerifySite failed: ${err.message}`);
        }
      }
      if (!ok) {
        findings.push(
          finding({
            key: `${cfg.domain}:bing:verify`,
            kind: 'manual',
            service: 'Bing Webmaster Tools',
            title: 'Finish Bing verification',
            body: `Automatic verification didn't complete. Any one of these works:\n\n- [ ] DNS: \`CNAME ${record.name} → verify.bing.com\`, then click Verify in Bing\n- [ ] Meta tag in <head>: \`<meta name="msvalidate.01" content="${site?.AuthenticationCode}" />\`\n- [ ] Or simply: Bing Webmaster Tools → Add site → **Import from Google Search Console** (once GSC is verified)`,
          }),
        );
        return { status: 'pending', findings };
      }
      log('  verified');
    }

    for (const sm of cfg.sitemaps) {
      await bing('SubmitFeed', { siteUrl: cfg.siteUrl, feedUrl: sm });
      log(`  submitted sitemap ${sm}`);
    }
    return { status: 'done', findings };
  },
};
