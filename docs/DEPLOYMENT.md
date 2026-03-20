# Deployment Guide

This guide covers production deployment for Swoop with Docker, Nginx, and HTTPS.

## 1. Recommended Production Topology

- App container: `swoop-app` on host port `8080`
- Nginx on host ports `80` and `443`
- PostgreSQL: either local Docker (`db` profile) or managed DB (Neon)
- Optional noVNC for remote Facebook login: port `6080`

## 2. Environment Setup

Create `.env` from `.env.example` and set at least:

- `DATABASE_URL`
- `APP_AUTH_SECRET`
- `APP_LOGIN_USERNAME`
- `APP_LOGIN_PASSWORD`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- `ALERT_FROM`, `ALERT_TO`

If using hosted popup login:

- `ALLOW_REMOTE_FACEBOOK_LOGIN=true`
- `VNC_PASSWORD=<strong-password>`

## 3. Build and Run

```bash
cd ~/dsktop/deal-traking-system

docker compose down
docker compose up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs --tail=200 app
```

## 4. Database Migrations

When schema changes are pulled:

```bash
docker compose exec app npm run prisma:deploy
```

## 5. Domain and HTTPS

Use Nginx reverse proxy to route `https://your-domain` to `http://127.0.0.1:8080`.

Then run certbot:

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain
```

## 6. Cloudflare + Custom Ports

If you need direct noVNC (`:6080`) and it does not open:

- Set DNS record to **DNS only** (gray cloud), or
- Use SSH tunnel instead

## 7. SSH Tunnel for noVNC (No Public 6080 Needed)

Run from your local machine:

```bash
ssh -L 6080:127.0.0.1:6080 user@server-ip
```

Open in local browser:

- `http://localhost:6080/vnc.html`

## 8. Security Checklist

- Rotate leaked secrets immediately (DB URL password, SMTP app password)
- Restrict SSH firewall rule to your IP only
- Do not leave noVNC public without auth controls
- Keep `.env` out of git
