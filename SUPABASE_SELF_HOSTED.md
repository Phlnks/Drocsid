# Self-Hosting Supabase for Drocsid

This guide explains how to deploy a self-hosted **Supabase** instance for Drocsid in a way that matches the current Drocsid model where **Nginx** terminates TLS, **Certbot** manages certificates, and the public Supabase entrypoint is proxied to **Kong on local port 8000**.

It is written as a practical open-source deployment guide, not as a generic Supabase tutorial. If your own host differs, adapt the domains and local ports, but keep the redirect and proxy logic identical.

---

## 1. Target architecture

Recommended public endpoints:

- `https://drocsid.yourdomain.com` → Drocsid app and Node/Express server
- `https://supabase.yourdomain.com` → Supabase public API entrypoint (Kong)
- `wss://livekit.yourdomain.com` → LiveKit signaling endpoint

Local services on the host:

- Drocsid app server: `127.0.0.1:3000`
- Supabase Kong gateway: `127.0.0.1:8000`
- LiveKit signaling: `127.0.0.1:7880`

The important rule is simple:

- **The browser talks to Supabase through the public Supabase domain**.
- **OAuth must redirect the user back to the public Drocsid app domain**.

---

## 2. Prerequisites

Before starting, make sure you have:

- an Ubuntu server with Docker and Docker Compose installed
- Nginx installed on the host
- Certbot installed on the host
- a real domain name with DNS records pointing to the server
- at least two subdomains: one for Drocsid and one for Supabase

Example DNS layout:

- `drocsid.yourdomain.com` → your server public IP
- `supabase.yourdomain.com` → your server public IP

HTTPS is required for secure cookies, WebAuth flows, mic/camera access, and production browser behavior.

---

## 3. Install Supabase

Clone the official Supabase repository and start from the Docker directory:

```bash
git clone --depth 1 https://github.com/supabase/supabase.git /opt/supabase
cd /opt/supabase/docker
cp .env.example .env
```

Review the upstream `docker-compose.yml` and `.env` because Supabase sometimes changes variable names or service names between releases.

---

## 4. Generate secrets

Edit `/opt/supabase/docker/.env` and replace all default development secrets.

Generate strong values with:

```bash
openssl rand -hex 32
```

At minimum, set and store securely:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `ANON_KEY`
- `SERVICE_ROLE_KEY`
- dashboard credentials if your selected compose version exposes them

Do not publish real keys in your repository. The open-source repo should contain only `.env.example` placeholders.

---

## 5. Public proxy with Nginx

In the Drocsid model, public traffic does **not** hit Supabase containers directly. Nginx handles ports 80/443 and proxies the public Supabase domain to **Kong on 127.0.0.1:8000**.

Create `/etc/nginx/sites-available/drocsid`:

```nginx
server {
    listen 80;
    server_name drocsid.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name supabase.yourdomain.com;
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site and reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/drocsid /etc/nginx/sites-enabled/drocsid
sudo nginx -t
sudo systemctl reload nginx
```

Then issue certificates:

```bash
sudo certbot --nginx -d drocsid.yourdomain.com -d supabase.yourdomain.com
```

After Certbot, verify that both domains answer over HTTPS.

---

## 6. GoTrue and redirect configuration

This is the most important part of the setup.

### 6.1 Core rule

For Drocsid, `GOTRUE_SITE_URL` must point to the **public Drocsid app URL**, not to the Supabase URL.

Correct:

```env
GOTRUE_SITE_URL=https://drocsid.yourdomain.com
```

Wrong:

```env
GOTRUE_SITE_URL=https://supabase.yourdomain.com
```

If you point `GOTRUE_SITE_URL` to Supabase, users may authenticate successfully at the provider level but then land on the wrong final URL or end up outside your app flow.

### 6.2 Redirect allow-list

Also set the allow-list to include every client you want to support:

```env
GOTRUE_URI_ALLOW_LIST=https://drocsid.yourdomain.com/**,http://localhost:3000/**,http://localhost:5173/**,drocsid://**,com.drocsid.app://**
```

Adjust this list to your actual clients:

- web production domain
- local development URLs
- Electron custom protocol if used
- mobile deep links if used

### 6.3 Google provider

Enable Google OAuth in `/opt/supabase/docker/.env`:

```env
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=your-google-client-secret
GOTRUE_COOKIE_SECURE=true
```

Depending on the Supabase self-hosted version, some variables may be prefixed or named slightly differently. Keep the same logic even if upstream names change.

---

## 7. Google Cloud Console configuration

In Google Cloud Console, edit your OAuth client.

### Authorized JavaScript origins

Add at least:

- `https://drocsid.yourdomain.com`
- `https://supabase.yourdomain.com`

### Authorized redirect URI

Use the Supabase callback endpoint:

- `https://supabase.yourdomain.com/auth/v1/callback`

This is the expected split:

- the OAuth provider redirects to **Supabase callback**
- Supabase completes auth
- Supabase sends the user back to the **Drocsid app URL** through the configured site URL and allowed redirect flow

---

## 8. Start the stack

From `/opt/supabase/docker`:

```bash
docker compose up -d
```

Then verify the containers:

```bash
docker compose ps
```

In this guide, the public API must be reachable through `https://supabase.yourdomain.com`, while Nginx proxies internally to Kong on `127.0.0.1:8000`.

---

## 9. Connect Drocsid to Supabase

Your Drocsid app `.env` should use the **public Supabase URL**, not the internal local port.

Example:

```env
VITE_SUPABASE_URL=https://supabase.yourdomain.com
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-or-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Notes:

- `VITE_SUPABASE_URL` is used by the client.
- `SUPABASE_SERVICE_ROLE_KEY` must remain server-side only.
- Never expose the service role key in client bundles or public docs.

---

## 10. Database schema and storage buckets

After the stack is healthy:

1. load your Drocsid SQL schema into the database
2. create the storage buckets expected by the app
3. verify RLS and realtime publication behavior

Typical buckets used by Drocsid:

- `avatars`
- `attachments`
- `server-icons`

If your app expects those buckets to be public, document that clearly in the repository and make the bucket visibility consistent with your SQL/storage policies.

---

## 11. Validation checklist

Run these checks before declaring the install complete.

### Public endpoint checks

```bash
curl -I https://drocsid.yourdomain.com
curl -I https://supabase.yourdomain.com
```

You should receive valid HTTPS responses.

### Local proxy checks on the host

```bash
curl -I http://127.0.0.1:3000
curl -I http://127.0.0.1:8000
```

These confirm that Nginx has working local upstreams.

### Container health

```bash
docker compose ps
docker compose logs -f auth
docker compose logs -f kong
```

### OAuth flow check

1. open Drocsid in the browser
2. trigger Google sign-in
3. observe the provider redirect
4. confirm the callback reaches `https://supabase.yourdomain.com/auth/v1/callback`
5. confirm the final navigation returns the user to `https://drocsid.yourdomain.com`

If the final redirect points to the wrong host, review `GOTRUE_SITE_URL` and the allow-list.

---

## 12. Common mistakes

- Setting `GOTRUE_SITE_URL` to the Supabase domain instead of the Drocsid domain
- Using an internal host/port in `VITE_SUPABASE_URL` instead of the public HTTPS domain
- Forgetting to add the exact Google callback URL
- Forgetting HTTPS on production domains
- Publishing real service keys in the repository
- Assuming upstream Supabase ports are identical across all versions without verifying the compose file

---

## 13. Open-source repository advice

For the public Drocsid repository, include:

- a `SUPABASE_SELF_HOSTED.md` like this one
- a `.env.example` with placeholders only
- a short architecture diagram in the main docs
- the exact bucket names and SQL bootstrap order
- a troubleshooting section for Google OAuth redirects

That gives self-hosters a deployment path that matches Drocsid’s actual public routing model while remaining easy to adapt.
