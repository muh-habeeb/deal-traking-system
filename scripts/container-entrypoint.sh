#!/bin/sh
set -eu

start_gui_stack() {
  export DISPLAY="${DISPLAY:-:99}"
  export XVFB_SCREEN="${XVFB_SCREEN:-1366x768x24}"
  export VNC_PORT="${VNC_PORT:-5900}"
  export NOVNC_PORT="${NOVNC_PORT:-6080}"

  echo "[entrypoint] Starting Xvfb on ${DISPLAY} (${XVFB_SCREEN})"
  Xvfb "$DISPLAY" -screen 0 "$XVFB_SCREEN" -nolisten tcp >/tmp/xvfb.log 2>&1 &

  echo "[entrypoint] Starting Fluxbox window manager"
  fluxbox >/tmp/fluxbox.log 2>&1 &

  if [ -n "${VNC_PASSWORD:-}" ]; then
    x11vnc -storepasswd "$VNC_PASSWORD" /tmp/.vncpasswd >/dev/null 2>&1
    VNC_AUTH_FLAGS="-rfbauth /tmp/.vncpasswd"
  else
    VNC_AUTH_FLAGS="-nopw"
    echo "[entrypoint] WARNING: VNC_PASSWORD not set, VNC will be open without password"
  fi

  echo "[entrypoint] Starting x11vnc on ${VNC_PORT}"
  # shellcheck disable=SC2086
  x11vnc -display "$DISPLAY" -forever -shared -listen 0.0.0.0 -rfbport "$VNC_PORT" $VNC_AUTH_FLAGS >/tmp/x11vnc.log 2>&1 &

  if command -v websockify >/dev/null 2>&1; then
    echo "[entrypoint] Starting noVNC web client on ${NOVNC_PORT}"
    websockify --web=/usr/share/novnc/ "$NOVNC_PORT" "localhost:${VNC_PORT}" >/tmp/novnc.log 2>&1 &
  else
    echo "[entrypoint] websockify not found, skipping noVNC"
  fi
}

if [ "${ALLOW_REMOTE_FACEBOOK_LOGIN:-false}" = "true" ]; then
  start_gui_stack
else
  echo "[entrypoint] Hosted interactive login disabled (ALLOW_REMOTE_FACEBOOK_LOGIN=false)"
fi

echo "[entrypoint] Running database migrations"
npm run prisma:deploy

echo "[entrypoint] Starting app server"
exec npm run start
