// Polls public resolvers until a record is visible, so verification calls don't fire too early.
import { Resolver } from 'node:dns/promises';

const resolver = new Resolver();
resolver.setServers(['1.1.1.1', '8.8.8.8']);

export async function recordVisible({ type, name, content }, r = resolver) {
  try {
    if (type === 'TXT') {
      const rows = await r.resolveTxt(name);
      return rows.some((chunks) => chunks.join('') === content);
    }
    if (type === 'CNAME') {
      const rows = await r.resolveCname(name);
      const want = content.replace(/\.$/, '').toLowerCase();
      return rows.some((v) => v.replace(/\.$/, '').toLowerCase() === want);
    }
  } catch {
    return false; // NXDOMAIN / ENODATA while propagating
  }
  return false;
}

export async function waitForRecord(record, { timeoutSeconds = 300, intervalSeconds = 15, log = console.log } = {}) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (true) {
    if (await recordVisible(record)) return true;
    if (Date.now() > deadline) return false;
    log(`  dns: waiting for ${record.type} ${record.name} to propagate...`);
    await new Promise((r) => setTimeout(r, intervalSeconds * 1000));
  }
}
