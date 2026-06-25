# Self-Hosting LiveKit for Drocsid

This guide explains the **official reference deployment** for LiveKit in the open-source Drocsid repository.

Reference choices for this repository:

- **Nginx + Certbot** for public HTTPS and WSS
- **LiveKit built-in TURN** instead of a separate coTURN service
- **one official token endpoint path**: `https://livekit.yourdomain.com/api/livekit/token`
- local upstreams kept private on the host

This keeps the deployment simpler for self-hosters while staying consistent with the overall Drocsid routing model.

---

## 1. Public domains and local upstreams

Recommended public endpoints:

- `https://drocsid.yourdomain.com` → Drocsid app/backend
- `https://supabase.yourdomain.com` → Supabase public API
- `https://livekit.yourdomain.com` → LiveKit HTTPS/WSS + token endpoint

Recommended local upstreams:

- Drocsid app server: `127.0.0.1:3000`
- token service: `127.0.0.1:3001`
- LiveKit signaling/API: `127.0.0.1:7880`

Traffic split:

- Nginx proxies HTTPS/WSS requests
- LiveKit handles TURN and media on dedicated host ports
- the token endpoint signs join tokens server-side only

---

## 2. Required firewall rules

Open these ports both on the Linux host and in the cloud firewall/security list:

| Port / Range | Protocol | Purpose |
| --- | --- | --- |
| `80` | TCP | HTTP challenge and redirect |
| `443` | TCP | HTTPS and WSS |
| `3478` | TCP and UDP | TURN/STUN |
| `50000-60000` | UDP | LiveKit media |

Example UFW commands:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 50000:60000/udp
sudo ufw reload
```

---

## 3. LiveKit configuration

Create `/opt/livekit/livekit.yaml`:

```yaml
port: 7880
bind_addresses:
  - "127.0.0.1"
  - "::1"

keys:
  your_livekit_api_key: "your_livekit_api_secret"

logging:
  level: info

rtc:
  use_external_ip: true
  port_range_start: 50000
  port_range_end: 60000

turn:
  enabled: true
  domain: livekit.yourdomain.com
  udp_port: 3478
  tls_port: 5349
  external_tls: true
```

Notes:

- `keys` must match the backend env used for token signing.
- `use_external_ip: true` is important on public VPS deployments.
- This repository uses built-in TURN to avoid the extra operational burden of coTURN.
- Depending on the exact LiveKit version, some TURN fields may differ slightly. Validate against the version you deploy.

---

## 4. Run LiveKit

Example Docker command:

```bash
docker run -d \
  --name livekit-server \
  --restart unless-stopped \
  -p 7880:7880 \
  -p 3478:3478/tcp \
  -p 3478:3478/udp \
  -p 50000-60000:50000-60000/udp \
  -v /opt/livekit/livekit.yaml:/livekit.yaml \
  livekit/livekit-server:latest \
  --config /livekit.yaml
```

If you later pin a specific version, replace `latest` in both the docs and deployment manifests.

---

## 5. Nginx config

Create or extend your Nginx site definition:

```nginx
server {
    listen 80;
    server_name livekit.yourdomain.com;

    location /api/livekit/token {
        proxy_pass http://127.0.0.1:3001/api/livekit/token;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

Then:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d livekit.yourdomain.com
```

---

## 6. Token service contract

The official public token endpoint for this repository is:

- `https://livekit.yourdomain.com/api/livekit/token`

The token service itself listens locally on:

- `127.0.0.1:3001`

Expected behavior:

1. authenticate the caller
2. verify the user may join the requested room
3. sign a short-lived LiveKit JWT
4. return the token to the client

Do not expose the API secret to the browser.

---

## 7. Environment variables

### Token service / backend

```env
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
```

### Frontend

```env
VITE_LIVEKIT_URL=wss://livekit.yourdomain.com
VITE_LIVEKIT_TOKEN_ENDPOINT=https://livekit.yourdomain.com/api/livekit/token
```

Keep this exact public path consistent across the repository.

---

## 8. Validation checklist

### Endpoint checks

```bash
curl -I https://livekit.yourdomain.com
curl -I https://livekit.yourdomain.com/api/livekit/token
curl -I http://127.0.0.1:7880
```

### Listener checks

```bash
sudo ss -ltnp | grep -E '7880|3001|80|443|3478'
sudo ss -lunp | grep -E '3478|50000|60000'
```

### Container logs

```bash
docker logs livekit-server
```

### End-to-end test

1. open two separate clients
2. request a token from the public endpoint
3. connect both clients to the same room
4. verify WSS signaling succeeds
5. verify audio works from both sides
6. test again from a more restrictive network if possible

---

## 9. Troubleshooting

### Signaling succeeds but no audio

Usually means UDP media ports or TURN are blocked.

Check:

- host firewall
- cloud firewall/security rules
- UDP range `50000-60000`
- port `3478`

### Mobile network fails but home Wi-Fi works

Usually means TURN is missing or unreachable.

Check:

- TURN port exposure
- public DNS resolution of `livekit.yourdomain.com`
- TURN config in `livekit.yaml`

### Token endpoint returns 500

Usually means:

- missing `LIVEKIT_API_KEY`
- missing `LIVEKIT_API_SECRET`
- mismatch between env and `livekit.yaml`
- wrong Nginx upstream for `/api/livekit/token`

### WSS handshake fails

Usually means:

- invalid certificate
- bad websocket proxy headers
- wrong `VITE_LIVEKIT_URL`

---

## 10. Version pinning advice

Before publishing the final repository docs, it is better to pin the exact LiveKit image version you are using.

Useful commands on your server:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}'
docker inspect <livekit-container-name> --format '{{.Config.Image}}'
docker exec <livekit-container-name> livekit-server --version
```

If you send me that version, I can adapt the file to that exact release and tighten the `livekit.yaml` example.
