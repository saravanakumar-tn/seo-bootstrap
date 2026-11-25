// IndexNow (Bing, Yandex, Seznam, Naver, ...): a key file hosted at https://site/<key>.txt,
// then a ping with your URLs. Microsoft now recommends IndexNow for real-time URL submission.
// Existence check: if INDEXNOW_KEY is set and its key file is already live, we just ping.

import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { request } from '../lib/http.js';
import { finding } from '../lib/findings.js';

export default {
  id: 'indexnow',
  title: 'IndexNow',
  enabled: (cfg) => cfg.indexNow.enabled,
  plan: (cfg) => [
    'use INDEXNOW_KEY or generate one',
    cfg.indexNow.keyFileDir ? `write key file into ${cfg.indexNow.keyFileDir}/` : 'print the key file you need to deploy',
    `if ${cfg.siteUrl}<key>.txt is live: ping api.indexnow.org with the homepage`,
  ],

  async run({ cfg, env, log, fetchImpl = fetch }) {
    const findings = [];
    const generated = !env.INDEXNOW_KEY;
    const key = env.INDEXNOW_KEY || randomBytes(16).toString('hex');
    const keyLocation = new URL(`/${key}.txt`, cfg.siteUrl).href;

    if (cfg.indexNow.keyFileDir) {
      mkdirSync(cfg.indexNow.keyFileDir, { recursive: true });
      writeFileSync(join(cfg.indexNow.keyFileDir, `${key}.txt`), key);
      log(`  wrote ${cfg.indexNow.keyFileDir}/${key}.txt`);
    }

    let live = false;
    try {
      const res = await fetchImpl(keyLocation);
      live = res.ok && (await res.text()).trim() === key;
    } catch {
      /* not live */
    }

    if (!live) {
      findings.push(
        finding({
          key: `${cfg.domain}:indexnow:key`,
          kind: 'manual',
          service: 'IndexNow',
          title: 'Deploy the IndexNow key file',
          body: `${generated ? 'A new key was generated. ' : ''}The key file isn't live at ${keyLocation} yet.\n\n- [ ] ${generated ? `Save \`${key}\` as the \`INDEXNOW_KEY\` secret so future runs reuse it\n- [ ] ` : ''}Add a file \`${key}.txt\` containing \`${key}\` to your site's public/static root and deploy\n- [ ] Re-run the workflow`,
        }),
      );
      return { status: 'pending', details: { key, keyLocation }, outputs: { indexnow_key: key }, findings };
    }

    const host = new URL(cfg.siteUrl).host;
    await request('https://api.indexnow.org/IndexNow', {
      method: 'POST',
      body: { host, key, keyLocation, urlList: [cfg.siteUrl] },
    });
    log(`  pinged IndexNow for ${cfg.siteUrl}`);
    return { status: 'done', details: { key, keyLocation }, outputs: { indexnow_key: key }, findings };
  },
};
