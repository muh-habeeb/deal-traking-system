Swoop Hosting Runbook (VPS + Docker + Nginx + Cloudflare)

Goal
- Serve the app at https://habeeb.qzz.io/
- Keep Docker app on port 8080 internally on host
- Let Nginx own ports 80/443
- Use Certbot for SSL

Prerequisites
- DNS A record in Cloudflare:
  - Name: habeeb.qzz.io
  - Value: VPS public IP
  - Proxy: DNS only (gray cloud) during setup
- Project directory exists on VPS with:
  - docker-compose.yml
  - Dockerfile
  - .env

1) Correct Docker compose port strategy
- Do NOT bind app container directly to 80/443 when using Nginx.
- Use host port 8080 instead.

Example app service ports:
- "8080:4000"

Important DATABASE_URL rule in compose:
- Use: DATABASE_URL: "${DATABASE_URL}"
- Do NOT use: ${postgresql://...}
- Do NOT put full URL inside ${...}

2) Start app from project directory
- Error "no configuration file provided: not found" means you are not in the folder containing docker-compose.yml

Commands:
cd ~/dsktop/deal-traking-system
docker compose down
docker compose up -d --build

Verify app reachable locally:
curl http://localhost:8080

3) Disable Apache fully (to avoid default Apache page)
Commands:
sudo systemctl stop apache2
sudo systemctl disable apache2
sudo systemctl mask apache2

Check listeners:
sudo lsof -i :80
sudo lsof -i :443

Expected before Nginx reverse proxy is complete:
- Port 80/443 should NOT be owned by apache2
- Port 8080 can be owned by docker-proxy

4) Nginx reverse proxy for domain
Create site config:
sudo nano /etc/nginx/sites-available/habeeb.qzz.io

Use this config:
server {
    listen 80;
    server_name habeeb.qzz.io;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

Enable and reload:
sudo ln -sf /etc/nginx/sites-available/habeeb.qzz.io /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

5) Enable HTTPS with Certbot
Install:
sudo apt update
sudo apt install certbot python3-certbot-nginx -y

Issue cert:
sudo certbot --nginx -d habeeb.qzz.io

Test renewal:
sudo certbot renew --dry-run

6) Cloudflare after SSL works
- You can switch Cloudflare proxy to orange cloud if desired.
- SSL mode recommendation in Cloudflare: Full (strict)

7) Git update workflow on VPS (safe)
If pull fails with untracked files (Dockerfile/docker-compose/.dockerignore), use one of:

A) Keep local changes:
git stash push --include-untracked -m "local docker changes"
git pull origin main
git stash pop

B) Discard local changes and match remote exactly:
git fetch origin
git reset --hard origin/main

Then rebuild:
docker compose up -d --build

8) Common errors and exact meaning
- "no configuration file provided: not found"
  - Not in project directory when running docker compose.

- "invalid interpolation format ... DATABASE_URL"
  - Wrong compose syntax. Use DATABASE_URL: "${DATABASE_URL}" only.

- Apache default page appears
  - Apache is owning port 80. Stop/disable/mask apache2.

- Nginx fails to start while config test passes
  - Usually port conflict (Docker or Apache bound to 80/443).
  - Keep Docker on 8080 and Nginx on 80/443.

- CSS/JS missing while HTML loads
  - Often wrong URL/port usage or mixed HTTP/HTTPS routing.
  - Access through the same domain path via Nginx proxy.

9) Final target checks
- docker compose ps
- docker compose logs -f app
- curl -I http://127.0.0.1:8080
- curl -I http://habeeb.qzz.io
- curl -I https://habeeb.qzz.io

Security note
- Rotate exposed secrets immediately if shared in logs/chats:
  - DATABASE_URL credentials
  - SMTP app password
  - APP_AUTH_SECRET
  - Admin username/password
