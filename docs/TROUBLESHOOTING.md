# Troubleshooting

## Dashboard 500 on `/api/filters` or `/api/listings`

Possible causes:

- stale local process on port 4000
- schema mismatch after deploy
- bad database connection

Fix:

```powershell
$pids = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($pids) { $pids | ForEach-Object { Stop-Process -Id $_ -Force } }
```

Then:

```bash
npm run prisma:generate
npm run prisma:deploy
npm run dev
```

## Created column missing in production listings table

Likely stale cached `dashboard.js`.

Fix:

- hard refresh browser (`Ctrl+F5`)
- redeploy app
- purge CDN cache if using Cloudflare

## noVNC not opening

1. Verify in VPS:

```bash
curl -I http://localhost:6080/vnc.html
```

2. If `200 OK` locally but not from internet:

- open cloud firewall for tcp `6080`
- set Cloudflare record to DNS-only or use SSH tunnel

## SSH tunnel timeout

If `ssh ... port 22: Connection timed out`:

- VM reachable but SSH blocked in cloud firewall
- allow `tcp:22` ingress from your IP
- confirm VM external IP is correct

## Prisma TLS/network errors

Example:

- `Client network socket disconnected before secure TLS connection was established`

Actions:

- verify DB provider uptime
- check `DATABASE_URL` and SSL parameters
- retry scan; transient network errors may self-recover

## Docker image too large / no space left

- use managed DB (Neon) to avoid local postgres image overhead
- prune caches:

```bash
docker builder prune -af
docker image prune -af
```

- avoid unnecessary exposed services in compose
