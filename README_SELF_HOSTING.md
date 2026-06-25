# Drocsid Self-Hosting Guide

This document is the main installation entrypoint for people who want to run their own Drocsid instance.

The reference deployment documented in this repository uses:

- **Nginx** as the public reverse proxy
- **Certbot** for TLS certificates
- **Supabase self-hosted** behind **Kong on local port 8000**
- **LiveKit self-hosted** with **built-in TURN**
- a dedicated public domain for each major service

This guide intentionally favors a setup that is simple to reproduce while staying close to the current Drocsid routing model.

---

## 1. Recommended domain layout

Create three public DNS records pointing to your server:

- `drocsid.yourdomain.com` → Drocsid app and backend
- `supabase.yourdomain.com` → Supabase public API endpoint
- `livekit.yourdomain.com` → LiveKit HTTPS/WSS endpoint

Recommended local upstreams on the server:

- `127.0.0.1:3000` → Drocsid app/backend
- `127.0.0.1:8000` → Supabase Kong gateway
- `127.0.0.1:7880` → LiveKit signaling/API
- `127.0.0.1:3001` → optional dedicated token service

---

## 2. Installation order

Follow the setup in this order:

1. Prepare DNS records
2. Install Nginx and Certbot
3. Deploy Supabase self-hosted
4. Deploy Drocsid app/backend
5. Deploy LiveKit
6. Configure Google OAuth
7. Validate auth, uploads, and voice/video end to end

---

## 3. Main files in this repository

Use the docs in this order:

- `INFRASTRUCTURE_OVERVIEW.md` → architecture and request flow
- `SUPABASE_SELF_HOSTED.md` → Supabase, Kong, Google OAuth, redirect flow
- `LIVEKIT_SELF_HOSTED.md` → LiveKit, TURN, firewall, token endpoint

---

## 4. Environment model

At minimum, your deployment will need values equivalent to these.

### Drocsid app/backend

```env
APP_URL=https://drocsid.yourdomain.com
VITE_BACKEND_URL=https://drocsid.yourdomain.com

VITE_SUPABASE_URL=https://supabase.yourdomain.com
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

VITE_LIVEKIT_URL=wss://livekit.yourdomain.com
VITE_LIVEKIT_TOKEN_ENDPOINT=https://livekit.yourdomain.com/api/livekit/token
```

### Supabase self-hosted

```env
GOTRUE_SITE_URL=https://drocsid.yourdomain.com
GOTRUE_URI_ALLOW_LIST=https://drocsid.yourdomain.com/**,http://localhost:3000/**,http://localhost:5173/**,drocsid://**,com.drocsid.app://**
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=your-google-client-secret
GOTRUE_COOKIE_SECURE=true
```

Important rule:

- `GOTRUE_SITE_URL` must point to the **Drocsid app URL**, not to the Supabase URL.

---

## 5. Token endpoint choice

For this repository, the recommended reference model is:

- public token endpoint: `https://livekit.yourdomain.com/api/livekit/token`
- internal upstream: `127.0.0.1:3001`

This keeps LiveKit signaling and LiveKit token issuance grouped under the same public domain while keeping secrets server-side.

If you prefer, you can move token issuance to the main app backend later, but the repository docs should keep one official path to avoid confusion.

---

## 6. Firewall reminder

The following host and cloud firewall rules are required:

- `80/tcp`
- `443/tcp`
- `3478/tcp`
- `3478/udp`
- `50000-60000/udp`

Without the UDP rules, signaling may appear to work while audio/video fails.

---

## 7. Validation checklist

Before considering the install complete, verify:

- `https://drocsid.yourdomain.com` loads correctly
- `https://supabase.yourdomain.com` responds correctly
- Google OAuth returns to the Drocsid app after auth
- file uploads work
- `https://livekit.yourdomain.com/api/livekit/token` issues tokens only for authorized users
- two different clients can join the same room and exchange audio successfully

---

## 8. Secret hygiene

Never commit the following to the public repository:

- real `SUPABASE_SERVICE_ROLE_KEY`
- real `JWT_SECRET`
- real `LIVEKIT_API_SECRET`
- real Google OAuth secrets
- TLS private keys

Only publish placeholder values in `.env.example`.
