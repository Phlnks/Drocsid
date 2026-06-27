# Drocsid Infrastructure Overview

This document describes the reference self-hosted production architecture for Drocsid. It is meant to stay consistent with the main README and the service-specific installation guides.

## Core architecture

Drocsid separates the platform into dedicated layers:

- Drocsid web app and backend
- self-hosted Supabase stack
- LiveKit media/signaling stack
- Nginx reverse proxy and TLS termination

Reference public domains:

- `drocsid.yourdomain.com`
- `supabase.yourdomain.com`
- `livekit.yourdomain.com`

Reference local upstreams:

- `127.0.0.1:3000` → Drocsid web/backend
- `127.0.0.1:8000` → Supabase Kong gateway
- `127.0.0.1:7880` → LiveKit signaling/API
- `127.0.0.1:3001` → dedicated LiveKit token endpoint

## Component roles

### Drocsid app server

The Drocsid app server serves the web frontend and backend APIs. It also handles Socket.io traffic, application business logic, and integration with Supabase and LiveKit.

### Supabase stack

The self-hosted Supabase stack provides:

- PostgreSQL as the main relational database
- GoTrue for auth and OAuth handling
- Realtime for subscription-based updates
- Storage for avatars, attachments, and similar media
- Kong as the public API gateway on local port `8000`

### LiveKit stack

The LiveKit stack provides:

- HTTPS API and WSS signaling
- media routing for voice, video, and screen share
- built-in TURN for NAT traversal in the recommended deployment model
- token validation using the same API key and secret used by the token service

### Client surfaces

Drocsid currently has three client surfaces in the public documentation model:

- Web client
- Electron desktop app
- separate React Native + Expo mobile app

The infrastructure described here is shared backend infrastructure. The mobile app is not described as a Capacitor target and is treated as a separate project consuming the same backend platform.

For Windows desktop streaming, Drocsid can also rely on native helper executables to improve per-application audio capture during screen/application sharing. This is a client-side Windows capability, not a server infrastructure dependency.

## Reverse proxy model

Nginx is the recommended public edge entrypoint.

Recommended routing:

- `drocsid.yourdomain.com` → `http://127.0.0.1:3000`
- `supabase.yourdomain.com` → `http://127.0.0.1:8000`
- `livekit.yourdomain.com` → `http://127.0.0.1:7880` for LiveKit signaling/API
- `livekit.yourdomain.com/api/livekit/token` → `http://127.0.0.1:3001` for token issuance

Nginx and Certbot together provide public HTTPS and certificate management.

## Ports and firewall rules

Open the following ports at both host firewall and cloud firewall level:

| Port range | Protocol | Purpose |
| --- | --- | --- |
| 80 | TCP | HTTP and Certbot challenges |
| 443 | TCP | HTTPS, API, WSS |
| 3478 | TCP/UDP | TURN/STUN negotiation |
| 50000-60000 | UDP | LiveKit media traffic |

Without the UDP media range and TURN port, signaling may succeed while media fails.

## Auth flow

Google OAuth is handled through Supabase GoTrue.

Important rules:

- `GOTRUE_SITE_URL` must point to `https://drocsid.yourdomain.com`
- the Google OAuth redirect URI must point to `https://supabase.yourdomain.com/auth/v1/callback`
- the GoTrue allow list should include your expected web, desktop, and local development URLs

This split matters because Supabase handles the callback, but the user should return to the Drocsid app domain after authentication.

## LiveKit token flow

Clients do not connect to LiveKit with the master secret. They request a short-lived signed access token.

Reference flow:

1. client requests permission to join a room
2. token endpoint validates the user session and authorization
3. token endpoint signs a short-lived LiveKit token
4. client connects to `wss://livekit.yourdomain.com`
5. LiveKit validates the token and admits the client

Reference public token endpoint:

- `https://livekit.yourdomain.com/api/livekit/token`

Reference local token service:

- `127.0.0.1:3001`

## Windows desktop stream audio note

For Windows desktop application streaming, Drocsid can use two helper executables stored in `/bin`:

- `WindowsPIDResolver.exe`
- `ApplicationLoopback.exe`

These helpers are used to resolve the exact PID of the selected application and capture that application’s audio so it can be injected into the stream sent through LiveKit.

This improves viewer experience across platforms, but it remains a Windows desktop client feature. It does not change the server-side LiveKit deployment requirements.

## Storage expectations

Typical storage buckets used by Drocsid:

- `avatars`
- `attachments`
- `server-icons`
- `emojis` if enabled in your build

Storage policies and visibility should match your schema and application expectations.

## Operational note

The observed deployment currently uses `livekit/livekit-server:latest`. For a cleaner public open-source deployment guide, pinning a fixed LiveKit image tag is recommended before final publication.
