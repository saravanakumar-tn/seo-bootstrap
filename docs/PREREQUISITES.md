# One-time setup (do this once, reuse for every site)

Some things can't be automated because the services require a human to accept terms or sign in. You do these **once**; after that every new website is one workflow run.

| # | What | Why it can't be automated | Secret / variable it produces |
|---|------|---------------------------|-------------------------------|
| 1 | Google account | Account creation | — |
| 2 | Google Cloud project + APIs enabled | Console click-through | — |
| 3 | OAuth client **or** service account | Console click-through | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` **or** `GOOGLE_SERVICE_ACCOUNT_JSON` |
| 4 | Google Analytics account | Terms of Service must be accepted in the UI | `GA_ACCOUNT_ID` (variable) |
| 5 | Bing Webmaster Tools API key | Sign in + accept API terms | `BING_API_KEY` |
| 6 | DNS API token | Your DNS host | `CLOUDFLARE_API_TOKEN` or `VERCEL_TOKEN` |

## 1–2. Google Cloud project

1. Go to https://console.cloud.google.com → create a project, e.g. `seo-bootstrap`.
2. **APIs & Services → Library**, enable:
   - Google Search Console API
   - Site Verification API
   - Google Analytics Admin API

## 3a. OAuth (recommended for one person)

Properties are owned by **your** Google account, so they show up in the Search Console and GA UIs straight away.

1. **APIs & Services → OAuth consent screen**: External, add yourself as a test user.
   Then click **Publish app**. While the app is in *Testing*, Google expires refresh tokens after 7 days. A published but unverified app is fine for personal use; you'll see an "unverified app" warning once.
2. **Credentials → Create credentials → OAuth client ID → Desktop app**.
3. Run locally:
   ```bash
   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run auth:google
   ```
   Open the printed URL, approve, and copy the `GOOGLE_REFRESH_TOKEN`.
4. Save all three as repo or organization secrets:
   ```bash
   gh secret set GOOGLE_CLIENT_ID
   gh secret set GOOGLE_CLIENT_SECRET
   gh secret set GOOGLE_REFRESH_TOKEN
   ```

## 3b. Service account (teams / organizations)

1. **IAM & Admin → Service accounts → Create**. No roles are needed. Create a JSON key.
2. `gh secret set GOOGLE_SERVICE_ACCOUNT_JSON < key.json`, then delete the local file.
3. In Google Analytics → Admin → Account access management, add the service account's email as **Editor**.
4. Set the `SEO_OWNER_EMAILS` variable to the people who should also own the Search Console properties (comma-separated). The service account verifies the domain and then adds them as owners.

## 4. Google Analytics account

Create one at https://analytics.google.com if you don't have one. Admin → Account settings shows the **Account ID** (digits only).
`gh variable set GA_ACCOUNT_ID --body 123456789`

If your credentials can see exactly one GA account, you can leave this unset.

## 5. Bing Webmaster Tools

Sign in at https://www.bing.com/webmasters (a Google login works) → **Settings → API access → API Key → Generate**. One key per user covers every site.
`gh secret set BING_API_KEY`

## 6. DNS

| Provider | Secret | Permissions |
|----------|--------|-------------|
| Cloudflare | `CLOUDFLARE_API_TOKEN` | Zone → Zone → Read, Zone → DNS → Edit (all zones, or specific zones) |
| Vercel | `VERCEL_TOKEN` (+ `VERCEL_TEAM_ID` variable for team domains) | Full account token; domain must use Vercel nameservers |
| Anything else | none | Use `dns.provider: "manual"`. The run prints the records and opens an issue; add them, then re-run |

New provider? Add `src/dns/<name>.js` implementing `ensureRecord()` and register it in `src/dns/index.js`.

## IndexNow key (optional)

The first run generates a key and opens an issue telling you to save it as `INDEXNOW_KEY` and deploy `<key>.txt` to your site root. Reuse the same key for all your sites if you like.

## Secrets vs. organization secrets

If you keep many website repos, put the secrets at the **organization** level (or in this one repo, and run everything from here with `issues-repo` pointing at each site's repo).
