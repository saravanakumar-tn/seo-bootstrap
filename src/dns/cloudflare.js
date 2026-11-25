import { request } from '../lib/http.js';

const API = 'https://api.cloudflare.com/client/v4';

// Needs CLOUDFLARE_API_TOKEN with Zone:Read + DNS:Edit on the zone.
export function cloudflare({ domain, env, log }) {
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('dns.provider=cloudflare needs CLOUDFLARE_API_TOKEN (Zone:Read, DNS:Edit)');
  const cf = (path, opts = {}) =>
    request(`${API}${path}`, { ...opts, headers: { Authorization: `Bearer ${token}` } });

  let zoneId = env.CLOUDFLARE_ZONE_ID;
  async function zone() {
    if (zoneId) return zoneId;
    const res = await cf(`/zones?name=${encodeURIComponent(domain)}`);
    if (!res.result?.length) throw new Error(`Cloudflare zone "${domain}" not found for this token`);
    zoneId = res.result[0].id;
    return zoneId;
  }

  return {
    name: 'cloudflare',
    async ensureRecord({ type, name, content }) {
      const id = await zone();
      const existing = await cf(`/zones/${id}/dns_records?type=${type}&name=${encodeURIComponent(name)}`);
      const want = normalise(type, content);
      if (existing.result.some((r) => normalise(type, r.content) === want)) {
        log(`  dns: ${type} ${name} already present`);
        return { action: 'exists' };
      }
      // Verification CNAMEs must NOT be proxied or the target is hidden behind Cloudflare.
      await cf(`/zones/${id}/dns_records`, {
        method: 'POST',
        body: { type, name, content, ttl: 300, ...(type === 'CNAME' ? { proxied: false } : {}), comment: 'seo-bootstrap' },
      });
      log(`  dns: created ${type} ${name}`);
      return { action: 'created' };
    },
  };
}

function normalise(type, value) {
  let v = String(value).trim().replace(/^"|"$/g, '');
  if (type === 'CNAME') v = v.replace(/\.$/, '').toLowerCase();
  return v;
}
