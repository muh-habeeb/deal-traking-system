# Production VPS Guide (PM2 + Workers + Proxies)

This guide is for running Swoop directly on a VPS (no Docker), with:

- 1 API process
- multiple queue worker processes
- proxy rotation and session binding
- automatic restart on crash and reboot

## 1. Important Security First

If any secret or API key was exposed, rotate it first:

- rotate Webshare API key and proxy credentials
- rotate Telegram bot token if exposed
- rotate `APP_AUTH_SECRET`
- rotate SMTP password/app password

Never commit secrets. Keep them only in `.env`.

## 2. VPS Prerequisites

Recommended: Ubuntu 22.04+

Install Node.js LTS and build tools:

```bash
sudo apt update
sudo apt install -y curl git build-essential
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 3. Clone and Install

```bash
git clone <your-repo-url> swoop
cd swoop
npm install
```

Create env file:

```bash
cp .env.example .env
```

Set required env values in `.env`:

- `DATABASE_URL`
- `APP_AUTH_SECRET`
- `APP_LOGIN_USERNAME`, `APP_LOGIN_PASSWORD`
- SMTP values
- Telegram values (optional but recommended)

## 4. Run Database Migration

```bash
npm run prisma:generate
npm run prisma:deploy
```

## 5. Configure Production Process Model

This project already includes PM2 config in `ecosystem.config.cjs`.

Key behavior:

- `swoop-api`: 1 instance
- `swoop-worker`: 3 instances
- API has `START_QUEUE_WORKER_IN_SERVER=false` to avoid duplicate embedded workers

Do not run 3 API processes on the same port. Run one API plus many workers.

## 6. Proxy Setup (Webshare)

Use this exact order for production.

Step 6.1 - Get fields from Webshare dashboard

From each proxy row in Webshare, collect:

- host/IP (example: 31.59.20.176)
- port (example: 6754)
- username (from Username column)
- password (from Password column)

Where username/password come from:

- they are shown in the same proxy row in Webshare
- Authentication Method must be username/password
- Connection Method can be direct for this project

Step 6.2 - Create `data/proxies.json`

Linux/macOS:

```bash
cp data/proxies.example.json data/proxies.json
```

Windows PowerShell:

```powershell
Copy-Item data/proxies.example.json data/proxies.json
```

Fill `data/proxies.json` with your real proxies using this format:

```json
[
	{
		"server": "http://31.59.20.176:6754",
		"username": "YOUR_WEBSHARE_USERNAME",
		"password": "YOUR_WEBSHARE_PASSWORD"
	},
	{
		"server": "http://23.95.150.145:6114",
		"username": "YOUR_WEBSHARE_USERNAME",
		"password": "YOUR_WEBSHARE_PASSWORD"
	}
]
```

Notes:

- `server` must be `http://host:port`
- if Webshare gives same username/password for all rows, reuse them
- include one JSON object per proxy endpoint

Step 6.3 - Enable proxy env values in `.env`

```env
PROXY_ENABLED=true
PROXY_LIST_PATH=data/proxies.json
PROXY_ROTATE_ON_FAILURE=true
PROXY_MAX_FAILOVER_ATTEMPTS=3
PROXY_BIND_SESSION_TO_PROXY=true
```

Step 6.4 - Keep worker/proxy/session mapping stable

Proxy/session rule in production:

- 1 proxy <-> 1 session file <-> 1 worker slot

Do not swap one Facebook session across multiple proxy IPs.

Step 6.5 - Validate before PM2 start

- ensure `data/proxies.json` is valid JSON array
- ensure proxy count is at least worker count
- ensure no placeholder values remain
- keep `data/proxies.json` out of git

## 7. Create Session Per Worker Slot (One-time)

Linux/macOS examples:

```bash
WORKER_ID=0 PROXY_SESSION_INDEX=0 npm run auth:facebook
WORKER_ID=1 PROXY_SESSION_INDEX=1 npm run auth:facebook
WORKER_ID=2 PROXY_SESSION_INDEX=2 npm run auth:facebook
```

This saves files under `playwright/sessions/`.

If a session expires, refresh only that specific worker slot.

## 8. Start with PM2

Use existing scripts:

```bash
npm run pm2:start
npm run pm2:logs
```

Check status:

```bash
npx pm2 list
npx pm2 logs swoop-api --lines 100
npx pm2 logs swoop-worker --lines 100
```

Scale workers when needed:

```bash
npx pm2 scale swoop-worker 5
```

## 9. Persist PM2 After Reboot

```bash
npx pm2 save
npx pm2 startup
```

Run the command printed by `pm2 startup` (it usually needs sudo once).

## 10. Health and Monitoring

Health endpoint:

- `GET /api/health`

Quick check:

```bash
curl -s http://127.0.0.1:4000/api/health
```

Worker logs now include job start and completion metadata (`workerId`, `jobId`, `filterId`, `nextRunAt`).

## 11. Why `nextRunAt` Looks Wrong Sometimes

Logs use ISO UTC (`Z` suffix). Example:

- `04:10:56Z` -> `04:11:54Z` means ~58 seconds later, not tomorrow.

If local timezone differs, convert UTC to local when reading logs.

## 12. Crash Recovery Behavior

Current behavior:

- PM2 restarts crashed API/worker processes
- embedded worker auto-restarts with delay if enabled
- worker loop catches transient DB/network errors and retries

Recommended production mode remains:

- API without embedded worker
- dedicated PM2 worker processes

## 13. Production Rules

Do:

- keep worker count proportional to proxy count
- keep per-worker fixed session/proxy binding
- rotate proxies on failure
- keep random delays and avoid aggressive scraping

Do not:

- run many workers on one proxy
- share one Facebook session across different proxy IPs
- re-login every cycle
