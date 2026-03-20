# Facebook Session Setup

Swoop supports three ways to provide a valid Playwright Facebook session.

## Option A: Local Login + Import JSON (Most Reliable)

1. Run locally:

```bash
npm run auth:facebook
```

2. Complete login and save `storageState.json`.
3. In dashboard, use **Import storageState JSON**.
4. Paste JSON and click **Import Session JSON**.

Best for: cloud hosts where popup browsers are restricted.

## Option B: Hosted Popup Login (noVNC)

Requirements:

- `ALLOW_REMOTE_FACEBOOK_LOGIN=true`
- GUI stack enabled in container (Xvfb, VNC, noVNC)
- Reachable noVNC endpoint (`/vnc.html`)

Use flow:

1. Open noVNC screen (`http://server:6080/vnc.html` or via SSH tunnel)
2. In dashboard click **Start Facebook Login**
3. Complete Facebook login in noVNC window
4. Click **Save Session** (or wait for auto-save if enabled)

## Option C: Manual File Placement

Place valid storage state at:

- `PLAYWRIGHT_STORAGE_STATE_PATH` (default `playwright/storageState.json`)

Restart app after replacing file.

## Verify Session Health

Use dashboard **Refresh Session Status** and confirm:

- Session Ready
- Cookie count > 0

Or API:

- `GET /api/facebook-session/status`

## Common Errors

- `Interactive Facebook login is disabled in hosted mode`
  - Set `ALLOW_REMOTE_FACEBOOK_LOGIN=true` and provide GUI stack, or use Option A.

- `No cookies found in storage state`
  - Login did not complete, or wrong JSON pasted.

- noVNC URL not opening
  - Check `http://.../vnc.html` path (not `vnc.htm`)
  - Check firewall/Cloudflare/SSH tunnel settings
