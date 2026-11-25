# One-time setup, step by step

Do this **once**. Every website after that reuses the same keys.
Each step ends with **✅ Check**: confirm it before moving on.

You will collect these values (keep a note open while you go):

| Value | From | Saved on GitHub as |
|---|---|---|
| Client ID | Google Cloud | secret `GOOGLE_CLIENT_ID` |
| Client secret | Google Cloud | secret `GOOGLE_CLIENT_SECRET` |
| Refresh token | OAuth Playground | secret `GOOGLE_REFRESH_TOKEN` |
| GA account ID | Google Analytics | variable `GA_ACCOUNT_ID` |
| Bing API key | Bing Webmaster Tools | secret `BING_API_KEY` |
| Cloudflare token | Cloudflare | secret `CLOUDFLARE_API_TOKEN` |

Everything works from a phone browser. Use the Google account that should **own** your websites.

---

## Part A — Google Cloud (Search Console + Analytics access)

### Step 1. Create a project
1. Open **https://console.cloud.google.com**
2. Tap the project picker at the top → **New project**
3. Name: `seo-bootstrap` (any name works) → **Create**
4. Make sure the new project is selected in the picker

✅ **Check:** the top bar shows your new project's name.

### Step 2. Turn on 3 APIs
1. Menu ☰ → **APIs & Services → Library**
2. Search each name below, open it, tap **Enable**:
   - **Google Search Console API**
   - **Site Verification API**
   - **Google Analytics Admin API**

✅ **Check:** **APIs & Services → Enabled APIs & services** lists all three.

### Step 3. Set up the consent screen
1. Menu ☰ → **Google Auth Platform** (older UI: *OAuth consent screen*) → **Get started**
2. **App information:** App name `seo-bootstrap`, support email = your Gmail
3. **Audience:** choose **External**
4. **Contact information:** your Gmail → finish → **Create**
5. Go to **Audience** → under *Test users* tap **Add users** → add your Gmail
6. Still on **Audience** → **Publish app** → **Confirm**

> Why publish? In "Testing" mode Google kills the login after **7 days**. Publishing without verification is fine for your own use.

✅ **Check:** **Audience** shows *Publishing status: In production*.

### Step 4. Create the OAuth client
1. **Google Auth Platform → Clients → Create client**
2. Application type: **Web application**
3. Name: `seo-bootstrap`
4. Under **Authorised redirect URIs** → **Add URI** →
   `https://developers.google.com/oauthplayground`
5. **Create** → copy the **Client ID** and **Client secret** into your note

✅ **Check:** **Clients** lists `seo-bootstrap`, type *Web application*.

> Created a *Desktop app* client by mistake? Just create a new *Web application* one as above.

### Step 5. Get the refresh token (OAuth Playground)
1. Open **https://developers.google.com/oauthplayground**
2. Tap **⚙️** (top right) → tick **Use your own OAuth credentials** → paste Client ID and Client secret → close the panel
3. In the left panel, scroll to **Input your own scopes** and paste exactly:
   ```
   https://www.googleapis.com/auth/siteverification https://www.googleapis.com/auth/webmasters https://www.googleapis.com/auth/analytics.edit
   ```
4. Tap **Authorize APIs** → choose your Gmail
   - "Google hasn't verified this app" → **Advanced → Go to seo-bootstrap (unsafe)**. This is expected, because it's your own app.
   - Tick all permissions → **Continue**
5. Back in the Playground, at **Step 2**, tap **Exchange authorization code for tokens**
6. Copy the **Refresh token** (starts with `1//`) into your note

✅ **Check:** still in the Playground, at **Step 3**, paste this into *Request URI* and tap **Send the request**:
```
https://searchconsole.googleapis.com/webmasters/v3/sites
```
The response is **HTTP 200** (an empty `{}` is fine if you have no sites yet). A 401 or 403 means a scope or API is missing: recheck Steps 2 and 5.

> Prefer a terminal? `GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… npm run auth:google` does the same thing, but it needs a **Desktop app** client.

---

## Part B — Google Analytics account

### Step 6. Create the GA account (skip if you have one)
1. Open **https://analytics.google.com** → **Start measuring**
2. Account name: your name or brand → accept the terms
3. If it pushes you to create a property, you can stop there, because the tool creates properties for you

### Step 7. Copy the account ID
1. **Admin** (⚙️ bottom-left) → **Account settings**
2. Copy the **Account ID** (digits only, e.g. `312345678`)

✅ **Check:** the ID is only digits. It is not the `G-XXXX` ID; that one is per website and the tool creates it.

---

## Part C — Bing Webmaster Tools

### Step 8. Get the Bing API key
1. Open **https://www.bing.com/webmasters** → sign in (**Google login works**)
2. If asked to add a site, you can skip it
3. **⚙️ Settings → API access** → accept the terms → **API Key → Generate API Key**
4. Copy the key into your note

✅ **Check:** the API access page shows your key. One key covers all your sites.

---

## Part D — DNS (Cloudflare)

### Step 9. Create a DNS token
1. Open **https://dash.cloudflare.com** → profile icon → **My Profile → API Tokens → Create Token**
2. Use the template **Edit zone DNS**
3. Under **Permissions**, tap **+ Add more** and add: **Zone → Zone → Read**
   (so you end up with *Zone · DNS · Edit* **and** *Zone · Zone · Read*)
4. **Zone Resources:** *Include → Specific zone →* your domain
   (or *All zones* if you want one token for every future site)
5. **Continue to summary → Create Token** → copy it (it's shown only once)

✅ **Check:** the token page has a `curl` test command; it should say *"This API Token is valid and active"*.

> Not on Cloudflare? Vercel: create a token at vercel.com/account/tokens → secret `VERCEL_TOKEN`. Any other DNS host: skip this step and use `dns-provider: manual`. The run tells you which records to add.

---

## Part E — Save everything on GitHub

### Step 10. Pick the repo
Choose where the workflow will run:
- **Your website's repo** (recommended): issues about that site land next to its code. Copy [`examples/site-repo-workflow.yml`](../examples/site-repo-workflow.yml) to `.github/workflows/seo.yml` there.
- **This seo-bootstrap repo:** run *Actions → Set up SEO for a site* for any domain.

### Step 11. Add the secrets
In that repo: **Settings → Secrets and variables → Actions**

**Secrets** tab → **New repository secret**, once each:
| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from Step 4 |
| `GOOGLE_CLIENT_SECRET` | from Step 4 |
| `GOOGLE_REFRESH_TOKEN` | from Step 5 |
| `BING_API_KEY` | from Step 8 |
| `CLOUDFLARE_API_TOKEN` | from Step 9 |

**Variables** tab → **New repository variable**:
| Name | Value |
|---|---|
| `GA_ACCOUNT_ID` | from Step 7 |

✅ **Check:** the Secrets tab lists 5 names and the Variables tab lists 1. GitHub never shows secret values again, which is normal.

> Many website repos? Put these at **organization** level (Org settings → Secrets) so every repo shares them.

### Step 12. Dry run
1. **Actions** → your SEO workflow → **Run workflow**
2. Set **mode = `plan`** (or `--mode plan` locally) → **Run**
3. Open the run → the log ends with a line like:
   ```
   Credentials: google=oauth, bing=ok, issues=on
   ```

✅ **Check:** nothing says `MISSING`. You're done. Run it again with **mode = `setup`** to register the site for real.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `invalid_grant` from Google | Refresh token expired or revoked. App still in *Testing*? Publish it (Step 3.6), then redo Step 5 |
| `403 … API has not been used in project` | Enable the API named in the message (Step 2) |
| `redirect_uri_mismatch` in the Playground | Client isn't *Web application*, or the redirect URI in Step 4 is wrong |
| GA step opens a "GA4 account needed" issue | `GA_ACCOUNT_ID` is wrong, or the Google account in Step 5 has no access to it |
| Cloudflare `zone not found` | Token is missing *Zone · Zone · Read*, or it's limited to another zone (Step 9) |

## Team alternative: service account instead of Steps 3–5
1. Google Cloud → **IAM & Admin → Service accounts → Create** (no roles needed) → **Keys → Add key → JSON**
2. Save the whole JSON file as secret `GOOGLE_SERVICE_ACCOUNT_JSON`
3. Google Analytics → **Admin → Account access management → +** → add the service account email as **Editor**
4. Variable `SEO_OWNER_EMAILS` = people who should also own the Search Console properties (comma-separated)

## IndexNow key (no setup needed)
The first run generates a key and opens an issue telling you to save it as secret `INDEXNOW_KEY` and put `<key>.txt` in your site's root. Reuse the same key for all your sites.
