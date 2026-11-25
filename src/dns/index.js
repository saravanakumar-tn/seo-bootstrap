// DNS provider registry. Each provider implements:
//   ensureRecord({ type: 'TXT'|'CNAME', name: fqdn, content }) -> { action: 'created'|'exists'|'manual' }
// Add a new provider (Route53, Namecheap, GoDaddy, ...) by dropping a file here and registering it below.

import { cloudflare } from './cloudflare.js';
import { vercel } from './vercel.js';
import { manual } from './manual.js';

const providers = { cloudflare, vercel, manual };

export function getDnsProvider(name, { domain, env = process.env, log = console.log } = {}) {
  const factory = providers[name];
  if (!factory) throw new Error(`Unknown dns.provider "${name}". Use one of: ${Object.keys(providers).join(', ')}`);
  return factory({ domain, env, log });
}

export const DNS_PROVIDERS = Object.keys(providers);
