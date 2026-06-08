# ShipHub Domain Migration: community.memobank.online to community.chainscreener.site

Last checked: 2026-06-08

## Goal

Move ShipHub production from:

- Old: `https://community.memobank.online`
- New: `https://community.chainscreener.site`

Recommended cutover model:

1. Support both domains temporarily.
2. Switch the canonical frontend/app URLs to the new domain.
3. Verify auth, API, chat/SSE, uploads, emails, and SEO metadata.
4. Redirect the old domain to the new domain after the new domain is stable.

## Implementation Status

Finalized on 2026-06-08:

- Backend commit `0f12080` pushed to GitHub and deployed.
- Frontend commit `afdb640` pushed to GitHub and deployed.
- Old-domain redirect finalized in production Nginx: `community.memobank.online` now returns `301` to `community.chainscreener.site` with the original path preserved.
- ShipHub backend `CORS_ORIGIN` now allows only `https://community.chainscreener.site`.
- Memo Bank API `SHIPHUB_REDIRECT_URI` now allows only `https://community.chainscreener.site/auth/callback/memobank`.
- `shiphub-api` and `memo-bank-api` were restarted with updated env and saved in PM2.

Earlier overlap implementation:

- `community.chainscreener.site` now serves ShipHub over HTTPS.
- Let's Encrypt certificate issued for `community.chainscreener.site`.
- ShipHub backend production env now uses the new domain for `FRONTEND_URL`, `SHIPHUB_REDIRECT_URI`, and `MEMOBANK_REDIRECT_URI`.
- Frontend static metadata and per-page `VITE_APP_URL` fallbacks now use `https://community.chainscreener.site`.

Verified:

- `https://community.memobank.online/health` returns `301` with `Location: https://community.chainscreener.site/health`.
- `https://community.chainscreener.site/health` returns ShipHub health OK.
- `https://community.chainscreener.site/v1/feed?type=all` returns feed data.
- `https://community.chainscreener.site/` serves the ShipHub frontend with new-domain OG metadata.
- `https://community.chainscreener.site/v1/auth/memobank/url` returns a Memo Bank authorize URL using the new callback.
- Memo Bank OAuth authorize endpoint accepts the new callback.
- CORS allows the new domain.
- `https://community.chainscreener.site/v1/chat/channels` returns community chat channels.
- `nginx -t` passes.
- `shiphub-api` and `memo-bank-api` are online in PM2.
- The new certificate expires on 2026-09-06.

## Current Findings

### DNS and HTTP

- `community.memobank.online` resolves through Cloudflare and currently serves ShipHub.
- `https://community.memobank.online/health` returns ShipHub health OK.
- `community.chainscreener.site` already has Cloudflare DNS records.
- `https://community.chainscreener.site/health` currently returns `404`.
- `http://community.chainscreener.site/health` currently returns Cloudflare `520`.
- Direct Nginx Host-header checks for `community.chainscreener.site` do not route to ShipHub yet.

Conclusion: DNS exists for the new domain, but the production VPS/Nginx/SSL path is not configured for ShipHub on that host yet.

### Production Nginx

ShipHub Nginx currently uses:

- `server_name community.memobank.online`
- frontend root: `/var/www/ship-hub/frontend`
- `/v1/` proxied to the ShipHub API on local port `4000`
- `/uploads/` proxied to the ShipHub API
- `/health` proxied to the ShipHub API
- Let's Encrypt cert paths under `community.memobank.online`

There is an existing Chainscreener Nginx config for:

- `chainscreener.site`
- `www.chainscreener.site`
- `api.chainscreener.site`

No `community.chainscreener.site` server block exists yet, so add it to ShipHub config or extend the ShipHub `server_name`. Do not modify the root/API Chainscreener blocks except where certificate coverage requires it.

### ShipHub Backend Env

Production ShipHub backend domain-related env currently points to the old domain:

```env
FRONTEND_URL=https://community.memobank.online
CORS_ORIGIN=https://community.memobank.online
MEMOBANK_REDIRECT_URI=https://community.memobank.online/auth/callback/memobank
SHIPHUB_REDIRECT_URI=https://community.memobank.online/auth/callback/memobank
MEMOBANK_URL=https://api.memobank.online/v1
```

Required change:

```env
FRONTEND_URL=https://community.chainscreener.site
CORS_ORIGIN=https://community.chainscreener.site
SHIPHUB_REDIRECT_URI=https://community.chainscreener.site/auth/callback/memobank
MEMOBANK_REDIRECT_URI=https://community.chainscreener.site/auth/callback/memobank
```

Safer staging option:

```env
CORS_ORIGIN=https://community.memobank.online,https://community.chainscreener.site
```

Implemented: backend CORS now parses comma-separated `CORS_ORIGIN` values, so both old and new domains can be allowed during the overlap window.

### ShipHub Frontend

Production frontend build currently uses same-origin API:

```env
VITE_API_BASE_URL=/v1
```

That can remain unchanged.

But the frontend has old canonical URL references:

- `frontend/index.html`
  - `og:url`
  - `og:image`
  - `twitter:image`
- `frontend/src/pages/MemoryPage.tsx`
  - `VITE_APP_URL` fallback is `https://community.memobank.online`
- `frontend/src/pages/PostDetailPage.tsx`
  - `VITE_APP_URL` fallback is `https://community.memobank.online`
- `frontend/src/pages/ProfilePage.tsx`
  - `VITE_APP_URL` fallback is `https://community.memobank.online`

GitHub Actions currently injects only:

```yaml
VITE_API_BASE_URL: ${{ secrets.VITE_API_BASE_URL }}
```

Required frontend options:

- Add `VITE_APP_URL=https://community.chainscreener.site` to the frontend production build env, preferably as a GitHub Actions secret.
- Also update static `index.html` OG/Twitter tags to the new domain, or make them templated via Vite env if desired.

### Memo Bank OAuth Provider

Memo Bank production currently has ShipHub OAuth configured with the old callback:

```env
SHIPHUB_REDIRECT_URI=https://community.memobank.online/auth/callback/memobank
```

Memo Bank OAuth code supports comma-separated `SHIPHUB_REDIRECT_URI` values and syncs redirect URIs into the `oauth_clients` table on startup.

Recommended staging value:

```env
SHIPHUB_REDIRECT_URI=https://community.memobank.online/auth/callback/memobank,https://community.chainscreener.site/auth/callback/memobank
```

Final value after cutover:

```env
SHIPHUB_REDIRECT_URI=https://community.chainscreener.site/auth/callback/memobank
```

Required action:

- Update Memo Bank API production env.
- Restart `memo-bank-api` so `ensureShipHubClient()` syncs the OAuth client.
- Verify `/v1/oauth/authorize` accepts the new redirect URI.

### Memo Bank API-Key Import

ShipHub imports Memo Bank projects/memories from:

- `https://api.memobank.online/v1/projects`
- `https://api.memobank.online/v1/memories`

This is not affected by the ShipHub community domain move.

### Memo Bank Frontend Integration

ShipHub allows compose drafts from these origins:

- `https://memobank.online`
- `https://www.memobank.online`
- local dev origins

This should remain unchanged.

Production Memo Bank code/static search did not reveal a direct `community.memobank.online` ShipHub link, aside from OAuth provider configuration.

### Email

ShipHub email links use:

```ts
const APP_URL = process.env.FRONTEND_URL ?? 'http://localhost:5174';
```

Changing backend `FRONTEND_URL` will update verification/reset links.

Email template footer still says:

```text
ShipHub - community.memobank.online
```

Implemented code change:

- Email footer derives the displayed host from `FRONTEND_URL`.

Sender currently uses:

```text
ShipHub <noreply@memobank.online>
```

Decision needed:

- Keep `noreply@memobank.online`, or move to a Chainscreener sender such as `noreply@chainscreener.site`.
- If changing sender, configure domain authentication in Resend before switching.

### Uploads and Stored Media URLs

Upload route returns URLs using the request origin:

```ts
url: `${baseUrl}/uploads/${filename}`
```

Nginx proxies `/uploads/` to the backend.

Production DB aggregate check:

```json
{
  "oldPostMedia": 0,
  "oldAvatars": 0,
  "relativePostMedia": 0
}
```

Conclusion: no current data migration is needed for stored post media/avatar URLs. Future uploads after the cutover will naturally use the new domain if users upload through the new domain.

### Auth Sessions and Browser Storage

ShipHub stores auth in localStorage under the current origin. Moving domains means:

- Users logged in on `community.memobank.online` will not be logged in on `community.chainscreener.site`.
- Users should expect to sign in again once on the new domain.
- OAuth state is stored in sessionStorage and is origin-specific, which is fine as long as the callback returns to the same origin that opened the OAuth popup.

### Community Chat and Notifications

Frontend uses same-origin `VITE_API_BASE_URL` for:

- notification SSE stream
- chat SSE stream
- API calls

If `VITE_API_BASE_URL=/v1` remains, no code change is needed. The new domain must have working Nginx proxying for `/v1/`.

### GitHub Actions

Backend deploy:

- Copies code to production backend path.
- Runs `npm ci`, `npm run build`, `npm run migrate`.
- Restarts PM2 app.
- Does not manage production `.env`.

Frontend deploy:

- Builds with `VITE_API_BASE_URL` secret.
- Deploys `dist` to production frontend path.
- Reloads Nginx.

Required GitHub changes:

- Add frontend secret `VITE_APP_URL=https://community.chainscreener.site`, or hardcode/update fallback and static tags in code.
- If backend CORS needs both old and new domains, make a code change first to parse comma-separated `CORS_ORIGIN`.
- Production `.env` changes must be made on the server, not through the current GitHub workflow.

### Cloudflare and SSL

New domain is already behind Cloudflare but currently not serving ShipHub.

Needed:

- Confirm `community.chainscreener.site` DNS points to the ShipHub VPS origin.
- Configure Nginx for the new host.
- Issue/attach TLS certificate for `community.chainscreener.site`.
- Because existing Chainscreener Nginx uses cert files for root/API Chainscreener domains, do not assume that cert covers the community subdomain. Either:
  - issue a Let's Encrypt cert for `community.chainscreener.site`, or
  - use a Cloudflare Origin Certificate that covers the subdomain.

### SEO, Social, and Redirects

Required:

- Update Open Graph canonical URL and images.
- Update `VITE_APP_URL` for per-memory, per-post, and profile OG URLs.
- Decide redirect behavior:
  - during staging: both domains serve ShipHub
  - after cutover: old domain should `301` to equivalent new path

Old-domain redirect example:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name community.memobank.online;
    return 301 https://community.chainscreener.site$request_uri;
}
```

Keep the old certificate valid while serving redirects.

## Recommended Implementation Plan

### Phase 1: Prepare Code

1. Update frontend canonical URLs:
   - `frontend/index.html`
   - `MemoryPage.tsx`
   - `PostDetailPage.tsx`
   - `ProfilePage.tsx`
2. Add `VITE_APP_URL` to frontend GitHub Actions build env.
3. Update backend email footer to derive from `FRONTEND_URL`.
4. Confirm backend CORS overlap is configured through comma-separated `CORS_ORIGIN`.
5. Build both repos locally.

### Phase 2: Prepare Memo Bank OAuth

1. Set Memo Bank API `SHIPHUB_REDIRECT_URI` to both callbacks:
   - old callback
   - new callback
2. Restart Memo Bank API.
3. Confirm authorize URL accepts the new callback.

### Phase 3: Prepare ShipHub Server

1. Update Nginx so ShipHub accepts `community.chainscreener.site`.
2. Add TLS for `community.chainscreener.site`.
3. Update ShipHub backend env:
   - `FRONTEND_URL`
   - `CORS_ORIGIN`
   - `SHIPHUB_REDIRECT_URI`
   - `MEMOBANK_REDIRECT_URI`
4. Restart ShipHub API with updated env.
5. Reload Nginx.

### Phase 4: Deploy Frontend

1. Push frontend changes to GitHub.
2. Confirm GitHub Actions builds with `VITE_APP_URL=https://community.chainscreener.site`.
3. Confirm deployed static files no longer contain `community.memobank.online` except where intentional for redirect/backward compatibility.

### Phase 5: Verify

Check:

- `https://community.chainscreener.site/`
- `https://community.chainscreener.site/health`
- `https://community.chainscreener.site/v1/feed?type=all`
- login with email/password
- login with Memo Bank OAuth
- Memo Bank API key import
- post creation
- image/video upload
- community chat channel list
- chat send
- notification SSE stream
- profile page OG URL
- post detail OG URL
- memory detail OG URL
- email verification/reset link generation

### Phase 6: Redirect Old Domain

After the new domain is stable:

1. Keep old backend OAuth callback allowed for a short grace period.
2. Add `301` redirect from old domain to new domain.
3. Later remove old callback from:
   - Memo Bank API `SHIPHUB_REDIRECT_URI`
   - ShipHub backend env
   - backend CORS origins

## Rollback Plan

If anything breaks:

1. Restore ShipHub backend env to the old domain.
2. Restore Nginx old-domain ShipHub server block as primary.
3. Keep Memo Bank OAuth allowing both callbacks until stable.
4. Redeploy frontend with `VITE_APP_URL=https://community.memobank.online`.
5. Verify old domain health and OAuth.

## Affected Systems Summary

| Area | Affected | Required Action |
| --- | --- | --- |
| DNS/Cloudflare | Yes | Point/fix `community.chainscreener.site` to ShipHub origin |
| Nginx | Yes | Add/extend server block and TLS for new host |
| ShipHub backend env | Yes | Update frontend URL, CORS, OAuth callback |
| ShipHub frontend build | Yes | Update canonical app URL and static OG tags |
| Memo Bank OAuth | Yes | Add new redirect URI and restart Memo Bank API |
| Memo Bank imports | No | Uses `api.memobank.online`, unchanged |
| Memo Bank compose draft origin | No | Memo Bank origin remains `memobank.online` |
| Upload proxy | Yes, config only | Ensure `/uploads/` works on new Nginx host |
| Existing media data | No current data migration | Production count found zero old-domain stored media/avatar URLs |
| Email links | Yes | Backend `FRONTEND_URL`; email footer code |
| Email sender | Maybe | Decision: keep Memo Bank sender or configure Chainscreener sender |
| Auth sessions | User-visible | Users will need to log in again on the new domain |
| SEO/social | Yes | Update OG/Twitter/canonical URLs |
| GitHub Actions | Yes | Add `VITE_APP_URL`; current backend workflow does not manage env |
| Old links/bookmarks | Yes | Keep old domain temporarily, then 301 redirect |
