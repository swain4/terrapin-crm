# Terrapin Solar CRM — Phase 6: Front End (GitHub Pages)

A mobile-first website that installers and office staff sign into with their Google account. It holds **no secrets** — it only knows your Web App URL and your public OAuth Client ID, and every request it makes is verified by the backend.

## Files
```
index.html
favicon.ico
CNAME             ← custom domain (crm.terrapinsolarpower.com) — see "Using your own domain" below
manifest.json     ← PWA metadata (name, icons, colors) — "Add to Home Screen"
sw.js             ← PWA service worker — app-shell caching, instant reopen
css/styles.css
js/config.js      ← the ONLY file you edit (2 values)
js/api.js         ← backend channel (POST, token auth, CORS-safe)
js/auth.js        ← Google Sign-In + session
js/app.js         ← router + all views (login, dashboard, search, job, upcoming, admin)
img/logo.png                  ← turtle mark used in the app bar (28×28)
img/logo-512.png              ← turtle mark used on the login screen + PWA icon
img/icon-192.png              ← PWA icon (Android home screen, smaller size)
img/icon-maskable-512.png     ← PWA "maskable" icon (Android adaptive icon shapes)
img/apple-touch-icon.png ← 180×180, used when someone adds the site to their home screen
img/favicon-32.png, img/favicon-16.png ← browser tab icons
```

## Why a single page (not separate .html files)
Google Sign-In hands the browser a token that lives in memory. With separate pages you'd lose it on every navigation and have to sign in again. A single page keeps you signed in as you move around — important on a phone at a jobsite. It's still plain HTML/CSS/JS with no build step.

---

## Setup — five stages, in order

### Stage 1 — Deploy the backend as a Web App (get the URL)
In your Apps Script project: **Deploy → New deployment → Web app**.
- Execute as: **Me** · Who has access: **Anyone** · Deploy → authorize.
- Copy the **Web app URL** ending in `/exec`. (Re-deploys: use **Manage deployments → Edit → New version** to keep the same URL.)

### Stage 2 — Create the Google OAuth Client ID
This is what powers "Sign in with Google."
1. Go to **console.cloud.google.com** → pick (or create) a project.
2. **APIs & Services → OAuth consent screen** → User type **Internal** (works because you're Google Workspace) → fill app name "Terrapin Solar CRM" and your support email → Save.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → Application type **Web application**.
4. Under **Authorized JavaScript origins**, add exactly:
   - `https://swain4.github.io`
   - (optional, for local testing) `http://localhost:8000`
5. Create → copy the **Client ID** (ends in `.apps.googleusercontent.com`). No secret is needed for the site.

### Stage 3 — Tell the backend about the client + origin
In Apps Script **Project Settings → Script Properties**, set:
- `GOOGLE_CLIENT_ID` = the Client ID from Stage 2
- `ALLOWED_ORIGIN` = `https://swain4.github.io`

### Stage 4 — Configure the site
Open `js/config.js` and fill the two placeholders:
- `API_URL` = the `/exec` URL from Stage 1
- `GOOGLE_CLIENT_ID` = the Client ID from Stage 2

### Stage 5 — Publish to GitHub Pages
1. Create a repo named **`terrapin-crm`** under your `swain4` account.
2. Upload these files, keeping the folder structure (`index.html` at the repo root, `css/` and `js/` beside it).
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / root → Save.**
4. Wait ~1 minute. Your site is live at **`https://swain4.github.io/terrapin-crm/`**.

---

## Testing
1. Open `https://swain4.github.io/terrapin-crm/` on your phone (or laptop).
2. Tap **Sign in with Google**, choose your `@terrapinsolarpower.com` account.
3. You should land on the dashboard with your name + role in the top bar.
4. Search `TS-2026-0001`, open the job, and confirm the buttons work: Maps, Start Deinstall Form (opens the prefilled form), View Job Photos, Mark Stage Complete.
5. Sign in test: an account **not** in your Users tab should be rejected with a clear message.

## Installing it as an app (PWA)
The site is a Progressive Web App — installers can put it on their home screen and it opens full-screen, with its own icon, no browser address bar, and it reopens instantly even on a weak signal.

**On an iPhone (Safari — must be Safari, not Chrome):**
1. Open the site → tap the **Share** icon (square with an arrow) → **Add to Home Screen** → **Add**.

**On Android (Chrome):**
1. Open the site → Chrome shows an **Install app** banner, or tap the **⋮** menu → **Install app** / **Add to Home screen**.

**On a laptop (Chrome/Edge):**
1. Open the site → click the **install icon** in the address bar (or **⋮** menu → **Install Terrapin Solar CRM**).

No setup needed on your end — `manifest.json` and `sw.js` already handle this. If you edit `app.js`/`styles.css` and a phone that already installed the app doesn't see your change right away, that's the service worker briefly serving what it has while it fetches the update in the background — it self-updates on the next open. To force-clear it immediately: on the phone, open the site in the browser (not the installed app icon) → browser menu → site settings → clear site data, or just bump `CACHE_VERSION` at the top of `sw.js` before your next deploy.

## Using your own domain instead of `github.io`
The site is now configured to use **`crm.terrapinsolarpower.com`** instead of `swain4.github.io`. GitHub Pages supports this for free — you keep hosting on GitHub, you just point your own domain at it. A `CNAME` file containing that domain is already in the repo root (that's the file GitHub Pages reads to know your custom domain), so most of the code-side setup is done. Three things are still on you, since they happen outside this repo:

1. **Add a DNS record** wherever `terrapinsolarpower.com`'s DNS is managed (your registrar or DNS host — e.g. GoDaddy, Cloudflare, Google Domains/Squarespace):
   - Type: **CNAME**
   - Name/Host: `crm`
   - Value/Target: `swain4.github.io`
2. **In the repo:** GitHub → Settings → Pages → confirm **Custom domain** shows `crm.terrapinsolarpower.com` (it should pick this up automatically from the `CNAME` file once you push/upload it — if the field is empty, type it in and Save yourself).
3. **Wait for DNS to propagate** (minutes to ~24 hours), then come back to Settings → Pages and check **Enforce HTTPS** once it's selectable (GitHub issues a free certificate for the new domain — this checkbox may take up to another 24 hours to appear after DNS resolves).
4. **Critical — update two places that still say `swain4.github.io`, or sign-in will break on the new domain:**
   - Google Cloud Console → your OAuth client → **Authorized JavaScript origins** → add `https://crm.terrapinsolarpower.com` (you can leave the old `github.io` origin in place too during the transition, or remove it once you've fully switched).
   - Apps Script → Script Properties → `ALLOWED_ORIGIN` → update to `https://crm.terrapinsolarpower.com`.
5. Once DNS resolves, your site is live at both `crm.terrapinsolarpower.com` and (unless you remove the custom domain later) the old `github.io` URL — GitHub automatically redirects the old one to the new one.

If you'd rather use a different domain/subdomain than `crm.terrapinsolarpower.com`, just say so — the `CNAME` file and the two Google-side updates above all need to change together to match whatever you pick.

## What each role sees (enforced by the backend, not the page)
- **Owner/Admin/Office** — everything, including Grand Total and the New Job form.
- **Lead Installer** — all jobs read-only, no pricing.
- **Installer** — only assigned jobs, no pricing, can document + mark stages + report problems.

## Common failure points
- **Sign-in button doesn't appear / "origin not allowed"** → the GitHub Pages origin isn't in the OAuth client's *Authorized JavaScript origins* (Stage 2.4). It must be exactly `https://swain4.github.io` (no path, no trailing slash).
- **"The server sent an unexpected response"** → the Web App deployment isn't *Execute as Me / Anyone*, or `API_URL` is wrong. Re-check Stage 1 and `config.js`.
- **Signed in but "not set up in the CRM"** → add that email to the **Users** tab (Active = Yes).
- **Everything says "not configured"** → `config.js` still has `PASTE_…` placeholders.
- **Edited backend code but site behaves old** → deploy a **new version** of the existing web app deployment.
- **Edited the front end but an installed phone app still looks old** → the PWA service worker is briefly serving its last cached copy; it self-updates within a few seconds of reopening online (see *Installing it as an app* above for a force-clear).

## Security notes
- `config.js` values are safe in a public repo. Never put Sheet IDs, folder IDs, or any Script Property secret in the front end.
- The site never trusts itself: hiding a button is cosmetic; the backend re-checks your identity, role, and per-job access on every request.
- Links from job data are validated to `http(s)` before opening, and all Sheet values are inserted as text (no HTML injection).

## Rollback
- Take the site down: Settings → Pages → set Source to **None** (or make the repo private). Your data and backend are untouched.
- Bad deploy of the backend: Apps Script → Manage deployments → **Archive**.

---

### Note on the calendar
The **Upcoming Jobs** view is live now (it reads scheduled dates from the database). The full month-grid calendar synced to Google Calendar comes with **Phase 5**, which we can slot in next — the front end already has a place for it.
