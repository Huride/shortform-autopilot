# Platform Setup — Click by Click

> `AUTOMATION.md` §6 tells you *what* you need; this tells you *where to click
> and where each value goes*. In the exact order we did it in production.
> Every secret goes in `.env` only (chmod 600, git-ignored). See `.env.example`.

---

## 1. OpenAI (script · TTS · images)

1. https://platform.openai.com → **Settings → API keys → Create new secret key**.
2. **Set a monthly budget cap in Billing first.** If the automation ever runs
   away, it can't spend past your test budget.
3. Put the key in `OPENAI_API_KEY`. It's shown once — save immediately.

---

## 2. YouTube (Data API v3)

### 2-1. GCP project & API
1. https://console.cloud.google.com → project picker → **New project**
   (dedicated to this channel — isolates audit/suspension risk from your other work).
2. **APIs & Services → Library → "YouTube Data API v3" → Enable**.

### 2-2. OAuth consent screen
1. **APIs & Services → OAuth consent screen** → User type **External** → Create.
2. App name + support email. Leave publishing status as **Testing**.
3. **Add the Google account that owns the channel under Test users.**
   ⚠️ Skipping this produces `403 access_denied` at login — the single most
   common trap.

### 2-3. OAuth client
1. **Credentials → Create credentials → OAuth client ID** → type **Desktop app**.
2. Put client_id / client_secret into `.env`.
   (The downloadable JSON matches `client_secret*.json` in .gitignore — keep it out of git.)

### 2-4. Refresh token
1. Open an auth URL of this shape (generate it with a script):
   ```
   https://accounts.google.com/o/oauth2/v2/auth
     ?client_id=<CLIENT_ID>
     &redirect_uri=http://localhost:8089/callback
     &response_type=code
     &scope=https://www.googleapis.com/auth/youtube.upload
     &access_type=offline&prompt=consent
   ```
   - For read/update/delete automation too, use the wider scope
     `https://www.googleapis.com/auth/youtube` (recommended: get it once, up front).
2. Log in → **on the account/brand-account chooser, pick the actual channel**.
3. Exchange the `code` at `https://oauth2.googleapis.com/token`
   (grant_type=authorization_code) → you get `refresh_token`.
4. ⚠️ **Never print the token — have the script write it straight into `.env`.**
   Codes are single-use; a masked terminal line means redoing consent.
5. Working on a remote machine? Local callbacks won't reach you — build a manual
   mode: print the URL, let the user authorize in their browser, and paste the
   full redirected URL back.

### 2-5. The API audit (the gate to public auto-publishing)
- `videos.insert` uploads from un-audited projects created after 2020-07-28 are
  **locked private**. Sending `privacyStatus: public` gets the video locked so
  hard even Studio can't flip it — never try.
- Pre-audit operation: upload `private`, owner flips to public in Studio
  (that path is never blocked).
- Apply: search "YouTube API Services – Audit and Quota Extension Form".
  You'll want: operator identity (business registration if applicable), a public
  website (GitHub Pages is fine — about + privacy policy + terms), a written
  description of your API use, demo screenshots / an architecture diagram.
  Review takes days to weeks.
- After passing, set `YOUTUBE_PRIVACY_STATUS=public` in `.env`. Done.

---

## 3. Instagram (Meta developers — Instagram Login path)

No Facebook Page needed on this path. The Instagram account must be a
**professional account** (Instagram app → Settings → Account type).

### 3-1. Create the Meta app
1. https://developers.facebook.com → **My Apps → Create App**.
2. Pick the **Instagram** use case ("Instagram API setup with Instagram login").
   A business portfolio can be attached later.
3. Your working screen is **Instagram → API setup with Instagram login** in the
   left menu.

### 3-2. Tester account (the key to dev-mode operation)
1. **App roles → Roles → Add People → Instagram Tester** → enter the publishing
   account's username.
   ⚠️ If you see "insufficient developer-role permissions", check you invited as
   Instagram *Tester* (Developer/Admin roles are for Facebook accounts).
2. **In the Instagram app**: Settings → Website permissions (Apps and Websites)
   → tester invites → **Accept**. No token issues before acceptance.

### 3-3. Token & User ID
1. On the API-setup screen → **Generate token** → log in with the Instagram
   account → you get the **long-lived (60-day) token** and the **IG User ID**.
2. Store as `IG_USER_ID`, `IG_ACCESS_TOKEN`.
3. **Refresh daily at the top of the pipeline**:
   `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<current>`
   → overwrite `.env` with the response token (idempotent; harmless daily).

### 3-4. Publishing endpoints (reference)
```
POST https://graph.instagram.com/v23.0/<IG_USER_ID>/media
     ?media_type=REELS&video_url=<public URL>&caption=...
GET  .../<container_id>?fields=status_code      # poll until FINISHED
POST .../<IG_USER_ID>/media_publish?creation_id=<container_id>
```
- Dev mode + tester account **publishes for real, publicly.** App Review only
  becomes relevant when you need to connect accounts you don't own.

---

## 4. Cloudflare R2 (public storage for Instagram ingestion)

1. https://dash.cloudflare.com → R2 → **Create bucket**.
2. Bucket **Settings → Public access → R2.dev subdomain → Allow**
   → the `https://pub-<hash>.r2.dev` URL is your `S3_PUBLIC_BASE_URL`.
   (Can't find it? It's on the bucket's own Settings tab. A custom domain also works.)
3. R2 overview → **Manage API tokens → Create API token** → permission
   "Object Read & Write", scoped to the bucket → you get the
   **Access Key ID / Secret Access Key**, and the endpoint
   (`https://<account-id>.r2.cloudflarestorage.com`) shown alongside is `S3_ENDPOINT`.
4. Upload with `@aws-sdk/client-s3` as-is. Stream uploads need `ContentLength`.

---

## 5. Order summary (a half-day run)

1. OpenAI key + budget cap (10 min)
2. R2 bucket + public URL + token (15 min)
3. Meta app + tester acceptance + long-lived token (30 min) → **Instagram can publish from day one**
4. GCP project + OAuth + refresh token (30 min) → private YouTube uploads work
5. Audit-application website (GitHub Pages) + form (2–3 h) → full automation once passed
