# Facebook Session Setup

Swoop uses a dashboard-first Facebook login flow with auto-save.

## Hosted Login Flow (Recommended)

Requirements:

- `ALLOW_REMOTE_FACEBOOK_LOGIN=true`
- GUI stack enabled in container (Xvfb, VNC, noVNC)
- Reachable noVNC endpoint (`/vnc.html`)
- Optional: `NO_VNC_PUBLIC_URL` for custom domain/path exposure

Use flow:

1. In dashboard click **Start Facebook Login**.
2. Click **Open Login Screen**.
3. Complete Facebook sign-in in that screen.
4. Session is auto-saved (no JSON upload needed).

## Manual File Placement (Fallback)

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
  - Set `ALLOW_REMOTE_FACEBOOK_LOGIN=true` and provide GUI stack.

- Session does not auto-save after login
  - Keep dashboard open for a few seconds after login and click **Refresh Session Status**.
  - Confirm noVNC/Xvfb is running and reachable.

- noVNC URL not opening
  - Check `http://.../vnc.html` path (not `vnc.htm`)
  - Check firewall/Cloudflare/SSH tunnel settings
