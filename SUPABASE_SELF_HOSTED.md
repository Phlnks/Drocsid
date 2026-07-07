# Self-Hosting Supabase for Drocsid

This guide documents the reference self-hosted Supabase setup for Drocsid. It is written to stay consistent with the main README and the infrastructure overview.

## Reference architecture

Public domains:

- `https://drocsid.yourdomain.com`
- `https://supabase.yourdomain.com`

Reference local upstreams:

- `127.0.0.1:3000` → Drocsid app/backend
- `127.0.0.1:8000` → Supabase Kong gateway

Important reference choice:

- Kong remains on local port `8000`

## What Supabase is used for

Drocsid uses Supabase for:

- PostgreSQL data storage
- authentication and OAuth via GoTrue
- realtime subscriptions
- file storage for avatars, attachments, and other app media

## Nginx and public routing

Expose the public Supabase domain through Nginx and proxy it to Kong on `127.0.0.1:8000`.

Typical split:

- `https://drocsid.yourdomain.com` → Drocsid application
- `https://supabase.yourdomain.com` → Supabase public API and auth callback domain

## Install base services

On Ubuntu:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

Then provision certificates for your Drocsid and Supabase domains.

## Deploy Supabase

Recommended path:

1. clone the official Supabase self-hosted repository or use the official Docker setup
2. copy the provided environment template
3. generate strong secrets for Postgres and JWT signing
4. start the stack with Docker Compose

## Critical auth rule

The most common self-hosting mistake is to set the wrong site URL.

Correct behavior:

- `GOTRUE_SITE_URL` must point to the Drocsid app URL:
  - `https://drocsid.yourdomain.com`

Google callback behavior:

- Google OAuth callback must point to:
  - `https://supabase.yourdomain.com/auth/v1/callback`

If `GOTRUE_SITE_URL` points to the Supabase domain instead of the Drocsid app domain, auth redirects often break or return users to the wrong place.

## GoTrue configuration checklist

Verify these points in your self-hosted auth config:

- `GOTRUE_SITE_URL` points to the Drocsid app URL
- `GOTRUE_URI_ALLOW_LIST` includes the expected app URLs and local development URLs
- `ENABLE_EMAIL_SIGNUP=true` is set if you want users to create local email/password accounts
- `ENABLE_EMAIL_AUTOCONFIRM=true` is set if you want new local accounts to be usable immediately without email validation
- `GOTRUE_EXTERNAL_EMAIL_ENABLED` should map to the same signup intent in your compose file so local email/password auth stays enabled
- Google provider credentials are configured correctly only if Google OAuth is enabled
- cookies are configured for secure HTTPS delivery where appropriate

If you support Electron and local development flows, include the URLs you actually need in the allow list. The public documentation model also assumes a separate React Native + Expo mobile app, but mobile deep-link values should be documented in the mobile project where they are actually used.

## Google OAuth configuration

In Google Cloud Console:

- authorized JavaScript origins should match your public web domains where applicable
- authorized redirect URI must include:
  - `https://supabase.yourdomain.com/auth/v1/callback`

## Database initialization

After Supabase is running:

1. Open Supabase Studio.
2. Navigate to the **SQL Editor**.
3. Load the contents of the `supabase.sql` schema file (located at the root of this project).
4. Replace "admin@example.com" placeholder value in the `supabase.sql` by your email before running it.
5. Run the entire script to execute and apply the schema (tables, foreign keys, functions, and real-time triggers) to your database.

## Storage buckets

Typical Drocsid buckets:

- `avatars`
- `attachments`
- `server-icons`
- `emojis` if enabled in your build

Verify that the bucket names, visibility, and storage policies match your app and SQL schema expectations.

## Validation and troubleshooting

Useful checks:

```bash
docker compose ps
docker compose logs -f auth
docker compose logs -f kong
docker compose logs -f db
```

If auth redirects fail:

- verify `GOTRUE_SITE_URL`
- verify the Google callback URI
- verify the GoTrue allow list
- restart the stack after changing auth-related config

If realtime seems broken:

- verify the realtime service is healthy
- verify your relevant tables are included in publication if required by your setup
- verify the client points to the correct public Supabase endpoint
