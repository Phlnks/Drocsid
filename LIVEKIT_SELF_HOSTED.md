# Self-Hosting LiveKit for Drocsid

This guide documents the reference self-hosted LiveKit setup for Drocsid. It stays aligned with the README and the infrastructure overview.

## Reference architecture

Public domain:

- `https://livekit.yourdomain.com`

Reference local upstreams:

- `127.0.0.1:7880` → LiveKit signaling/API
- `127.0.0.1:3001` → dedicated LiveKit token endpoint

Reference choices used in the public docs:

- built-in LiveKit TURN is the recommended path
- public token endpoint is `https://livekit.yourdomain.com/api/livekit/token`
- signaling endpoint exposed to clients is `wss://livekit.yourdomain.com`

## What LiveKit is used for

Drocsid uses LiveKit for:

- voice rooms
- video calls
- screen sharing
- NAT traversal and relay through TURN in restrictive networks

## Firewall and port requirements

Open these ports on the host and cloud firewall:

| Port range | Protocol | Purpose |
| --- | --- | --- |
| 80 | TCP | HTTP and Certbot challenges |
| 443 | TCP | HTTPS API and WSS signaling |
| 3478 | TCP/UDP | TURN/STUN |
| 50000-60000 | UDP | media traffic |

If these ports are not open, clients may reach signaling but still fail to carry audio or video.

## LiveKit configuration

The reference deployment keeps LiveKit on local port `7880` and uses the built-in TURN support rather than a separate coturn deployment.

Key requirements:

- `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` must match the token service configuration
- LiveKit should know the correct public IP or external network settings for your environment
- TURN must be enabled if you want reliable connectivity across strict NAT and firewall conditions

## Docker deployment

You can run LiveKit with host networking or explicit port mappings depending on your environment.

For Linux VPS deployments, host networking is often the simplest path for UDP-heavy WebRTC traffic, but explicit port publishing can also work if your environment requires it.

## Reverse proxy model

Nginx should expose:

- `https://livekit.yourdomain.com` → LiveKit API/signaling
- `https://livekit.yourdomain.com/api/livekit/token` → dedicated token service on `127.0.0.1:3001`

Important distinction:

- HTTPS/WSS signaling is proxied through Nginx
- TURN and media UDP flows are not handled like a normal HTTP reverse-proxy path and still require the proper firewall and host networking exposure

## Environment variables

Backend-side variables:

```env
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
```

Client-side variables:

```env
VITE_LIVEKIT_URL=wss://livekit.yourdomain.com
VITE_LIVEKIT_TOKEN_ENDPOINT=https://livekit.yourdomain.com/api/livekit/token
```

## Validation and troubleshooting

Useful checks:

```bash
docker logs <livekit-container>
sudo ss -tulpn | grep -E '7880|3478|443|80'
```

If a room connection fails:

- verify the WSS URL
- verify the token endpoint URL
- verify that the token service is running
- verify `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`

If signaling works but media does not:

- verify TURN is enabled
- verify ports `3478/tcp`, `3478/udp`, and `50000-60000/udp`
- verify external IP/public network settings
- test from a restrictive network, not only from the same LAN
