// Google Analytics 4: property + web data stream, returns the G-XXXX measurement ID.
// Existence checks:
//   - GA account: must already exist (creating one needs Terms of Service acceptance in the UI).
//   - Property/stream: any property in the account whose web stream points at this host, or whose
//     name matches, is reused instead of creating a duplicate, and an "already exists" issue is raised.

import { google } from '../lib/google-auth.js';
import { finding } from '../lib/findings.js';

const GA = 'https://analyticsadmin.googleapis.com/v1beta';

export default {
  id: 'ga4',
  title: 'Google Analytics 4',
  enabled: (cfg) => cfg.googleAnalytics.enabled,
  plan: (cfg) => [
    `check GA account ${cfg.googleAnalytics.accountId ?? '(auto-detect)'} exists`,
    `look for an existing property/web stream for ${new URL(cfg.siteUrl).host}`,
    `if none: create property "${cfg.googleAnalytics.propertyName}" (${cfg.googleAnalytics.timeZone}, ${cfg.googleAnalytics.currencyCode}) + web stream`,
    `set data retention to ${cfg.googleAnalytics.dataRetention}`,
  ],

  async run({ cfg, log }) {
    const ga = cfg.googleAnalytics;
    const host = new URL(cfg.siteUrl).host.replace(/^www\./, '');
    const findings = [];

    // ---- account ---------------------------------------------------------
    const accounts = await listAll(`${GA}/accounts`, 'accounts');
    let accountId = ga.accountId ? String(ga.accountId).replace(/^accounts\//, '') : null;
    if (!accountId && accounts.length === 1) accountId = accounts[0].name.split('/')[1];
    if (!accountId || !accounts.some((a) => a.name === `accounts/${accountId}`)) {
      findings.push(
        finding({
          key: `${cfg.domain}:ga4:account`,
          kind: 'manual',
          service: 'Google Analytics 4',
          title: 'GA4 account needed',
          body: `${accountId ? `Account \`${accountId}\` isn't visible to these credentials.` : `Found ${accounts.length} accounts, so the tool can't pick one.`}\n\nAccounts visible: ${accounts.map((a) => `\`${a.name.split('/')[1]}\` (${a.displayName})`).join(', ') || 'none'}\n\n- [ ] Create an account at https://analytics.google.com (needs Terms of Service in the UI) or grant the credentials Editor access\n- [ ] Set \`googleAnalytics.accountId\` / \`GA_ACCOUNT_ID\` and re-run`,
        }),
      );
      return { status: 'pending', findings };
    }

    // ---- existing property? ---------------------------------------------
    const properties = await listAll(`${GA}/properties?filter=${encodeURIComponent(`parent:accounts/${accountId}`)}`, 'properties');
    let match = null;
    for (const p of properties) {
      const streams = await listAll(`${GA}/${p.name}/dataStreams`, 'dataStreams');
      const web = streams.find((s) => s.webStreamData?.defaultUri && hostOf(s.webStreamData.defaultUri) === host);
      if (web) {
        match = { property: p, stream: web };
        break;
      }
      if (!match && p.displayName === ga.propertyName) match = { property: p, stream: streams.find((s) => s.type === 'WEB_DATA_STREAM') };
    }

    let property, stream;
    if (match) {
      ({ property, stream } = match);
      log(`  reusing ${property.name} "${property.displayName}"`);
      findings.push(
        finding({
          key: `${cfg.domain}:ga4:exists`,
          kind: 'exists',
          service: 'Google Analytics 4',
          title: 'GA4 property already exists',
          body: `Reused \`${property.name}\` "${property.displayName}" (created ${property.createTime?.slice(0, 10)}, time zone ${property.timeZone}, currency ${property.currencyCode}).\nWeb stream: ${stream ? `\`${stream.webStreamData?.measurementId}\` → ${stream.webStreamData?.defaultUri}` : '**none**'}\n\n- [ ] Check time zone/currency are what you want (can't be changed by this tool after creation)\n- [ ] Confirm the site actually sends data to this measurement ID\n- [ ] Delete duplicates if more than one property tracks ${host}`,
        }),
      );
    } else {
      property = await google(`${GA}/properties`, {
        method: 'POST',
        body: {
          parent: `accounts/${accountId}`,
          displayName: ga.propertyName,
          timeZone: ga.timeZone,
          currencyCode: ga.currencyCode,
          industryCategory: ga.industryCategory,
        },
      });
      log(`  created ${property.name}`);
    }

    if (!stream) {
      stream = await google(`${GA}/${property.name}/dataStreams`, {
        method: 'POST',
        body: { type: 'WEB_DATA_STREAM', displayName: host, webStreamData: { defaultUri: new URL(cfg.siteUrl).origin } },
      });
      log(`  created web stream ${stream.webStreamData.measurementId}`);
    }

    if (ga.dataRetention) {
      await google(`${GA}/${property.name}/dataRetentionSettings?updateMask=eventDataRetention`, {
        method: 'PATCH',
        body: { eventDataRetention: ga.dataRetention },
      });
    }

    const measurementId = stream.webStreamData.measurementId;
    log(`  measurement ID: ${measurementId}`);
    return { status: 'done', details: { property: property.name, measurementId }, outputs: { measurement_id: measurementId }, findings };
  },
};

async function listAll(url, key) {
  const out = [];
  let pageToken;
  do {
    const sep = url.includes('?') ? '&' : '?';
    const res = await google(`${url}${sep}pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`);
    out.push(...(res[key] ?? []));
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

function hostOf(uri) {
  try {
    return new URL(uri.includes('://') ? uri : `https://${uri}`).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}
