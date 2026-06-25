# Drocsid Self-Hosted Infrastructure Overview

This document gives a high-level but technically precise view of the recommended self-hosted Drocsid architecture.

It is aligned with these documentation choices:

- **Supabase public access goes through Kong on local port 8000**
- **Nginx + Certbot** handle public HTTP/HTTPS
- **LiveKit uses built-in TURN** in the recommended open-source path
- Drocsid keeps a separate app domain, Supabase domain, and LiveKit domain

This overview is meant to help self-hosters understand how the pieces fit together before following the installation guides.

---

## 1. Main components

Drocsid is split into three main service families.

### Drocsid application

- frontend served from the Drocsid app domain
- Node/Express backend for app APIs
- Socket.io or other realtime app-layer features
- optional token-signing route for LiveKit

### Supabase stack

- PostgreSQL database
- GoTrue authentication service
- Storage API
- Realtime services
- Kong as the public entrypoint, proxied locally on `127.0.0.1:8000`

### LiveKit stack

- LiveKit signaling/API on `127.0.0.1:7880`
- built-in TURN for NAT traversal in the reference open-source setup
- media UDP port range on the host

---

## 2. Domain model

Recommended public DNS layout:

| Public domain | Purpose | Local upstream |
| --- | --- | --- |
| `drocsid.yourdomain.com` | Drocsid web app and backend | `127.0.0.1:3000` |
| `supabase.yourdomain.com` | Supabase public API through Kong | `127.0.0.1:8000` |
| `livekit.yourdomain.com` | LiveKit HTTPS API and WSS signaling | `127.0.0.1:7880` |

Optional variant:

- a dedicated token service on `127.0.0.1:3001`, exposed either on the Drocsid domain or the LiveKit domain

---

## 3. Request flow

### Standard web app flow

1. the browser loads Drocsid from `https://drocsid.yourdomain.com`
2. the app talks to Supabase at `https://supabase.yourdomain.com`
3. Nginx proxies that traffic to Kong on `127.0.0.1:8000`
4. Kong forwards requests to the relevant Supabase services

### Google OAuth flow

1. the user starts sign-in from the Drocsid app
2. Supabase handles the OAuth provider exchange
3. Google redirects back to `https://supabase.yourdomain.com/auth/v1/callback`
4. Supabase completes the session flow
5. the user is returned to the Drocsid app URL defined by `GOTRUE_SITE_URL`

Critical rule:

- `GOTRUE_SITE_URL` must point to the **Drocsid app domain**, not the Supabase domain

### Voice/video flow

1. the client asks the app server for a signed LiveKit token
2. the server validates access and signs a short-lived JWT
3. the client connects to `wss://livekit.yourdomain.com`
4. Nginx proxies HTTPS/WSS signaling to `127.0.0.1:7880`
5. media and TURN traffic flow through the exposed UDP/TCP ports on the host

---

## 4. Port map

| Port / Range | Protocol | Used by |
| --- | --- | --- |
| `80` | TCP | Nginx, Certbot HTTP challenge |
| `443` | TCP | Nginx HTTPS and WSS signaling |
| `8000` | TCP | Kong local upstream for Supabase |
| `3000` | TCP | Drocsid local app upstream |
| `3001` | TCP | Optional dedicated token service |
| `7880` | TCP | LiveKit local signaling/API |
| `3478` | TCP and UDP | LiveKit TURN/STUN |
| `50000-60000` | UDP | LiveKit media |

Important distinction:

- ports `3000`, `3001`, `7880`, and `8000` are usually local/private upstream ports
- ports `80`, `443`, `3478`, and the media UDP range must be considered at the host and cloud firewall levels

---

## 5. Reverse proxy role

Nginx is the public entrypoint for HTTP, HTTPS, and WSS.

It typically handles:

- TLS certificates via Certbot
- HTTP to HTTPS redirect
- proxying the Drocsid app domain to `127.0.0.1:3000`
- proxying the Supabase domain to `127.0.0.1:8000`
- proxying the LiveKit domain to `127.0.0.1:7880`
- optional proxying of `/api/livekit/token` to `127.0.0.1:3001`

Nginx does **not** proxy the actual UDP media plane the same way it proxies HTTP requests.

---

## 6. Security model

### Supabase

- browser clients use the public Supabase HTTPS domain
- server-only actions use the service role key on trusted backend code only
- Google OAuth callback lands on the Supabase domain
- final authenticated app navigation returns to the Drocsid domain

### LiveKit

- clients never receive the LiveKit API secret
- the backend signs access tokens server-side
- tokens should be short-lived
- room/channel authorization should be checked before token issuance

### Public repository hygiene

- publish placeholders only in `.env.example`
- never publish real secrets, JWT keys, service role keys, or private certificates
- document which values are public URLs versus private server-side secrets

---

## 7. Recommended documentation set

A clean open-source Drocsid repository should include:

- `INFRASTRUCTURE_OVERVIEW.md`
- `SUPABASE_SELF_HOSTED.md`
- `LIVEKIT_SELF_HOSTED.md`
- `.env.example`
- a short install order in the main README

Suggested install order:

1. DNS + Nginx + Certbot
2. Supabase self-hosted
3. Drocsid app deployment
4. LiveKit deployment
5. OAuth setup and validation
6. final end-to-end voice/video tests

---

## 8. Practical design choice

This documentation keeps **Kong on local port 8000** to stay aligned with the current Drocsid model, but uses **LiveKit built-in TURN** because it is simpler for self-hosters than managing a separate coTURN service.

That gives you a setup that stays close to your current routing model while reducing operational complexity for people who want to run their own Drocsid instance.
