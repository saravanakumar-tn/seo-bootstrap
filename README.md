# seo-bootstrap

**One workflow run registers a new website with every search engine tool you need.** It checks what already exists, and opens GitHub issues for anything that needs a human.

| Service | What it does automatically |
|---|---|
| **Preflight** | Checks the homepage, `robots.txt` and sitemap, and looks for `noindex` |
| **Google Search Console** | Creates a Domain property (`sc-domain:`), verifies it with a DNS TXT record, adds owners and submits sitemaps |
| **Google Analytics 4** | Creates the property and web stream, sets 14-month data retention and outputs the `G-XXXX` ID |
| **Bing Webmaster Tools** | Adds the site, verifies it with a DNS CNAME record and submits sitemaps |
| **IndexNow** | Generates or reuses a key, checks the key file is live and pings `api.indexnow.org` |
| **DNS** | Cloudflare, Vercel, or `manual` (it prints the records and waits). Adding a provider takes one small file |

No dependencies: Node 20+ and `fetch` only.

## Existing accounts → GitHub issues

Every step checks first, and it is safe to run as often as you like:

- **Already exists**: a Search Console property, GA4 property or stream for the same host, or a Bing site. The tool **reuses it** instead of creating a duplicate and opens an issue labelled `seo:already-exists` with what it found and a review checklist.
- **Manual step needed**: things no API can do, such as linking GSC to GA4, accepting GA terms, waiting for DNS or deploying the IndexNow key file. These become issues labelled `seo:manual-step`.
- **Failed**: the error goes into an issue labelled `seo:failed`, and the other steps still run.

Issues are deduplicated. Each one carries a hidden `<!-- seo-bootstrap:<key> -->` marker. If an open issue already tracks the same thing, the tool comments on it (only when the details changed) instead of opening another. When you close an issue, it stays closed unless a later run finds the problem again.

## Quick start

1. Do the **one-time account setup** in [docs/PREREQUISITES.md](docs/PREREQUISITES.md). It takes about 15 minutes once, then covers every site.
2. Try a dry run locally:
   ```bash
   node src/cli.js plan --domain example.com --dns cloudflare
   ```
3. Run it for real, using any of these:
   - **From this repo**: Actions → *Set up SEO for a site* → enter the domain.
   - **From a website's repo**: copy [examples/site-repo-workflow.yml](examples/site-repo-workflow.yml), which calls `uses: saravanakumar-tn/seo-bootstrap@v0`.
   - **Locally**:
     ```bash
     export GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REFRESH_TOKEN=...
     export BING_API_KEY=... CLOUDFLARE_API_TOKEN=... GA_ACCOUNT_ID=...
     export GITHUB_TOKEN=... # optional, for issues
     node src/cli.js setup --domain example.com --dns cloudflare --issues-repo you/your-site
     ```

## Configuration

Pass flags, or commit a `seo.config.json` (see [seo.config.example.json](seo.config.example.json)). Settings are applied in this order, each overriding the one before: defaults, then the config file, then environment variables, then CLI flags.

| Key | Default | Notes |
|---|---|---|
| `domain` | — | Required |
| `siteUrl` | `https://<domain>/` | Use `https://www.<domain>/` if www is canonical |
| `sitemaps` | `<siteUrl>sitemap.xml` | |
| `dns.provider` | `manual` | `cloudflare` / `vercel` / `manual` |
| `dns.waitSeconds` | `300` | How long to wait for records to propagate before verifying |
| `owners` | `[]` | Extra Search Console owners (useful with a service account) |
| `googleAnalytics.accountId` | auto if only one | Or `GA_ACCOUNT_ID` |
| `googleAnalytics.timeZone` / `currencyCode` | `Etc/UTC` / `USD` | Set once at creation |
| `indexNow.keyFileDir` | `null` | e.g. `public`: writes `<key>.txt` there for your build |
| `<service>.enabled` | `true` | Turn any step off |

Run a subset with `--only gsc,ga4` or `--skip bing`.

## Outputs

- `seo-output.json`: status per step, GA4 measurement ID, IndexNow key, findings and issue links
- Action outputs: `measurement_id`, `indexnow_key`, `issues`
- A summary table in the GitHub job summary

## Secrets reference

| Name | Type | Needed for |
|---|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | secret | GSC + GA4 (OAuth mode) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | secret | GSC + GA4 (service-account mode) |
| `GA_ACCOUNT_ID`, `SEO_OWNER_EMAILS` | variable | GA4 / GSC owners |
| `BING_API_KEY` | secret | Bing |
| `INDEXNOW_KEY` | secret | IndexNow (generated on the first run) |
| `CLOUDFLARE_API_TOKEN` or `VERCEL_TOKEN` (+ `VERCEL_TEAM_ID`) | secret | DNS |
| `SEO_ISSUES_TOKEN` | secret | Only to open issues in a **different** repo (a fine-grained PAT with Issues: write) |

## What it deliberately doesn't do

- Create Google, Microsoft or GA *accounts*. That needs a human to accept the terms, so it becomes a one-time task (see the prerequisites).
- Link Search Console to GA4. There is no public API for it, so it opens an issue with the exact clicks.
- Yandex, Baidu, Naver, Microsoft Clarity and Google Business Profile aren't included yet. They're good first contributions: add `src/steps/<name>.js`, following the same `plan` / `run` / `findings` shape.

## Contributing

`npm test` runs the unit tests (Node's built-in runner, no dependencies). A step module exports:

```js
export default {
  id, title,
  enabled: (cfg) => boolean,
  plan: (cfg) => string[],                  // printed by `plan`
  run: async ({ cfg, env, dns, waitForRecord, log }) =>
    ({ status: 'done'|'pending'|'warn'|'skipped', outputs?, details?, findings? }),
};
```

Every `run` must be **idempotent**: check before creating, and report what already existed as a finding.

## License

MIT
