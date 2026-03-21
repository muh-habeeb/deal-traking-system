# Deployment Guide

This guide provides a production-ready setup for Swoop with:

- Docker (single app container)
- Nginx reverse proxy
- Let's Encrypt SSL (Certbot)
- Optional Cloudflare

## 1. Target Architecture

- App container listens internally on `127.0.0.1:8080 -> 4000`
- noVNC listens internally on `127.0.0.1:6080 -> 6080`
- Nginx handles public `80/443`
- Public app URL: `https://your-domain`
- noVNC URL via Nginx path: `https://your-domain/novnc/vnc.html`

## 2. Prerequisites

- Ubuntu/Debian VPS with Docker and Docker Compose
- Domain DNS A record pointing to this VPS public IPv4
- Open ports `80` and `443` in both the VPS firewall (`ufw`) and cloud provider firewall/security group

## 3. Environment Configuration

Create `.env` from `.env.example` and set required values:

- `DATABASE_URL`
- `APP_AUTH_SECRET`
- `APP_LOGIN_USERNAME`
- `APP_LOGIN_PASSWORD`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `ALERT_FROM`
- `ALERT_TO`

Recommended production values:

```env
NODE_ENV=production
ALLOW_REMOTE_FACEBOOK_LOGIN=true
NO_VNC_PUBLIC_URL=https://your-domain/novnc/vnc.html?autoconnect=true&path=novnc/websockify
CORS_ORIGIN=https://your-domain
```

## 4. Docker Configuration

Use localhost-only host bindings in `docker-compose.yml`:

```yaml
ports:
  - "127.0.0.1:8080:4000"
  - "127.0.0.1:6080:6080"
```

Start or update deployment:

```bash
docker compose down --remove-orphans
docker compose up -d --build
docker compose ps
docker compose logs --tail=200 app
```

Check internal services:

```bash
curl -I http://127.0.0.1:8080/
curl -I http://127.0.0.1:6080/vnc.html
```

## 5. Install Nginx + Certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable --now nginx
```

If Apache is installed, disable it to avoid port conflicts:

```bash
sudo systemctl stop apache2
sudo systemctl disable apache2
```

## 6. Nginx Site Configuration

Create `/etc/nginx/sites-available/your-domain`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

upstream swoop_app {
    server 127.0.0.1:8080;
    keepalive 32;
}

upstream swoop_novnc {
    server 127.0.0.1:6080;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name your-domain;

    location ^~ /novnc/ {
        proxy_pass http://swoop_novnc/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    location / {
        proxy_pass http://swoop_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable and test:

```bash
sudo ln -sf /etc/nginx/sites-available/your-domain /etc/nginx/sites-enabled/your-domain
sudo nginx -t
sudo systemctl reload nginx
```

## 7. SSL with Certbot

Before issuing cert:

- If using Cloudflare, set DNS record to `DNS only` (gray cloud) temporarily
- Ensure DNS A record points to the correct server IP

Issue certificate:

```bash
sudo certbot --nginx -d your-domain
```

Test renewals:

```bash
sudo certbot renew --dry-run
```

After certificate is working, Cloudflare can be re-enabled with SSL mode `Full (strict)`.

## 8. Optional noVNC Authentication

If you want extra protection on `/novnc/`:

```bash
sudo apt install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd-novnc admin
```

Then add inside `location ^~ /novnc/`:

```nginx
auth_basic "Restricted noVNC";
auth_basic_user_file /etc/nginx/.htpasswd-novnc;
```

Note: browser auth inside iframes may vary by browser policy. If login screen hangs in iframe, test without `auth_basic` first.

## 9. Firewall Hardening

Only keep required public ports:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw delete allow 5900
sudo ufw delete allow 6080
sudo ufw status
```

## 10. 502 Troubleshooting Checklist

If app route fails:

```bash
curl -I http://127.0.0.1:8080/
```

If noVNC route fails:

```bash
curl -I http://127.0.0.1:6080/vnc.html
```

Inspect logs:

```bash
docker compose logs --tail=200 app
sudo tail -n 100 /var/log/nginx/error.log
sudo tail -n 100 /var/log/nginx/access.log
```

## 11. Security Checklist

- Rotate exposed secrets immediately (`APP_AUTH_SECRET`, `SMTP_PASS`, `APP_LOGIN_USERNAME`, `APP_LOGIN_PASSWORD`)
- Keep `.env` out of source control
- Use Cloudflare SSL mode `Full (strict)` when proxy is enabled
