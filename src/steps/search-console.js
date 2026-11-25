// Google Search Console: Domain property (sc-domain:) verified by DNS TXT, plus sitemap submission.
// Existence check: if the property is already in your Search Console, verification is skipped and a
// "already exists" finding is raised so someone can review its owners/sitemaps later.

import { google } from '../lib/google-auth.js';
import { HttpError } from '../lib/http.js';
import { finding } from '../lib/findings.js';

const SV = 'https://www.googleapis.com/siteVerification/v1';
const SC = 'https://searchconsole.googleapis.com/webmasters/v3';

export default {
  id: 'gsc',
  title: 'Google Search Console',
  enabled: (cfg) => cfg.googleSearchConsole.enabled,
  plan: (cfg) => [
    `check whether sc-domain:${cfg.domain} or ${cfg.siteUrl} is already in Search Console`,
    `if not: get DNS TXT token, add TXT @ ${cfg.domain} via ${cfg.dns.provider}, verify, add property`,
    ...(cfg.owners.length ? [`add owners: ${cfg.owners.join(', ')}`] : []),
    `submit sitemaps: ${cfg.sitemaps.join(', ')}`,
  ],

  async run({ cfg, dns, waitForRecord, log }) {
    const property = `sc-domain:${cfg.domain}`;
    const findings = [];

    // ---- existence check -------------------------------------------------
    const { siteEntry = [] } = await google(`${SC}/sites`);
    const domainEntry = siteEntry.find((s) => s.siteUrl === property);
    const prefixEntry = siteEntry.find((s) => s.siteUrl === cfg.siteUrl);

    if (prefixEntry && !domainEntry) {
      findings.push(
        finding({
          key: `${cfg.domain}:gsc:url-prefix`,
          kind: 'exists',
          service: 'Google Search Console',
          title: 'URL-prefix property already exists',
          body: `\`${cfg.siteUrl}\` is already in Search Console (permission: ${prefixEntry.permissionLevel}).\nA Domain property \`${property}\` will be added too; it covers http/https and all subdomains.\n\n- [ ] Decide whether to keep the URL-prefix property\n- [ ] Make sure its sitemaps match the Domain property`,
        }),
      );
    }

    let verified = false;
    if (domainEntry && domainEntry.permissionLevel !== 'siteUnverifiedUser') {
      log(`  ${property} already in Search Console (${domainEntry.permissionLevel})`);
      verified = true;
      const sitemaps = await google(`${SC}/sites/${encodeURIComponent(property)}/sitemaps`).catch(() => ({}));
      findings.push(
        finding({
          key: `${cfg.domain}:gsc:exists`,
          kind: 'exists',
          service: 'Google Search Console',
          title: 'Search Console property already exists',
          body: `\`${property}\` was already in Search Console with permission **${domainEntry.permissionLevel}**, so verification was skipped.\n\nSitemaps currently registered:\n${(sitemaps.sitemap ?? []).map((s) => `- ${s.path} (last downloaded ${s.lastDownloaded ?? 'never'}, errors ${s.errors ?? 0})`).join('\n') || '- none'}\n\n- [ ] Review owners and users in Settings → Users and permissions\n- [ ] Remove sitemaps that no longer exist`,
        }),
      );
    }

    // ---- verify via DNS TXT ---------------------------------------------
    if (!verified) {
      const site = { type: 'INET_DOMAIN', identifier: cfg.domain };
      const { token } = await google(`${SV}/token`, { method: 'POST', body: { site, verificationMethod: 'DNS_TXT' } });
      const record = { type: 'TXT', name: cfg.domain, content: token };
      await dns.ensureRecord(record);

      const visible = await waitForRecord(record, { timeoutSeconds: cfg.dns.waitSeconds, log });
      if (!visible) {
        findings.push(manualDns(cfg, record));
        return { status: 'pending', details: { token }, findings };
      }

      try {
        const res = await google(`${SV}/webResource?verificationMethod=DNS_TXT`, { method: 'POST', body: { site } });
        log(`  verified ${cfg.domain} (owners: ${res.owners?.join(', ')})`);
        await addOwners(res, cfg.owners, log);
      } catch (err) {
        if (!(err instanceof HttpError) || err.status !== 400) throw err;
        findings.push(manualDns(cfg, record, err.message));
        return { status: 'pending', details: { token }, findings };
      }

      await google(`${SC}/sites/${encodeURIComponent(property)}`, { method: 'PUT' });
      log(`  added ${property} to Search Console`);
    }

    // ---- sitemaps (idempotent) -----------------------------------------
    for (const sm of cfg.sitemaps) {
      await google(`${SC}/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(sm)}`, { method: 'PUT' });
      log(`  submitted sitemap ${sm}`);
    }

    // Only raised on first setup, so closing the issue keeps it closed on later runs.
    if (!domainEntry) findings.push(
      finding({
        key: `${cfg.domain}:gsc:link-ga4`,
        kind: 'manual',
        service: 'Google Search Console',
        title: 'Link Search Console to GA4',
        body: 'There is no public API for this link yet.\n\n- [ ] GA4 → Admin → Product links → Search Console links → Link → choose `' + property + '` and the web stream',
      }),
    );

    return { status: 'done', details: { property }, findings };
  },
};

async function addOwners(resource, owners, log) {
  const missing = owners.filter((o) => !resource.owners?.includes(o));
  if (!missing.length) return;
  await google(`${SV}/webResource/${encodeURIComponent(resource.id)}`, {
    method: 'PUT',
    body: { ...resource, owners: [...(resource.owners ?? []), ...missing] },
  });
  log(`  added owners: ${missing.join(', ')}`);
}

function manualDns(cfg, record, error) {
  return finding({
    key: `${cfg.domain}:gsc:verify`,
    kind: 'manual',
    service: 'Google Search Console',
    title: 'Finish Search Console DNS verification',
    body: `Verification hasn't gone through yet${error ? ` (\`${error}\`)` : ''}.\n\n- [ ] Make sure this record exists at your DNS host:\n\n\`\`\`\nTXT  ${record.name}  ${record.content}\n\`\`\`\n\n- [ ] Re-run the workflow (DNS can take up to a few hours)`,
  });
}
