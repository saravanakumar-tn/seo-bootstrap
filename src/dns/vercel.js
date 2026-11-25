import { request } from '../lib/http.js';

const API = 'https://api.vercel.com';

// Needs VERCEL_TOKEN; VERCEL_TEAM_ID if the domain lives in a team. Domain must use Vercel nameservers.
export function vercel({ domain, env, log }) {
  const token = env.VERCEL_TOKEN;
  if (!token) throw new Error('dns.provider=vercel needs VERCEL_TOKEN');
  const team = env.VERCEL_TEAM_ID ? `teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : '';
  const v = (path, opts = {}) => {
    const sep = path.includes('?') ? '&' : '?';
    return request(`${API}${path}${team ? sep + team : ''}`, { ...opts, headers: { Authorization: `Bearer ${token}` } });
  };

  // Vercel wants the label relative to the zone: "" for apex, "_x.www" for _x.www.example.com
  const relative = (fqdn) => (fqdn === domain ? '' : fqdn.slice(0, -(domain.length + 1)));

  return {
    name: 'vercel',
    async ensureRecord({ type, name, content }) {
      const label = relative(name);
      const res = await v(`/v4/domains/${encodeURIComponent(domain)}/records?limit=100`);
      const clean = (s) => String(s).trim().replace(/^"|"$/g, '').replace(/\.$/, '').toLowerCase();
      const found = (res.records ?? []).some(
        (r) => r.type === type && (r.name ?? '') === label && clean(r.value) === clean(content),
      );
      if (found) {
        log(`  dns: ${type} ${name} already present`);
        return { action: 'exists' };
      }
      await v(`/v2/domains/${encodeURIComponent(domain)}/records`, {
        method: 'POST',
        body: { name: label, type, value: content, ttl: 300, comment: 'seo-bootstrap' },
      });
      log(`  dns: created ${type} ${name}`);
      return { action: 'created' };
    },
  };
}
