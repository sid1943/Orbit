#!/usr/bin/env bash
# Runs Orbit on this Mac in the background (macOS LaunchAgents), so it keeps going after
# Terminal closes and starts again at login:
#   - the API on http://localhost:8787 (local database in apps/api/.wrangler)
#   - the web app on http://localhost:5173
#   - the updater: runs the API's 10-minute job (linking, TV status), which local mode doesn't do on its own
#
# Usage: scripts/mac-background.sh install | uninstall | restart | status | logs
# Nothing runs while the Mac sleeps; it picks up again when it wakes.
set -euo pipefail

LABEL=com.orbit
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/orbit"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SERVICES=(api web updater)

die() { echo "orbit: $*" >&2; exit 1; }
plist() { echo "$AGENTS/$LABEL.$1.plist"; }

# launchd starts programs without your shell setup (nvm, etc.), so record where node is now.
node_dir() {
  local node
  node="$(command -v node)" || die "node not found. Open a Terminal where 'node -v' works and run this again."
  dirname "$node"
}

write_plist() { # name, workdir, command..., ends with StartInterval or KeepAlive block
  local name=$1 dir=$2 extra=$3; shift 3
  local args=""
  for a in "$@"; do args+="    <string>${a}</string>"$'\n'; done
  cat > "$(plist "$name")" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL.$name</string>
  <key>WorkingDirectory</key><string>$dir</string>
  <key>ProgramArguments</key>
  <array>
$args  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$NODE_DIR:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>WRANGLER_SEND_METRICS</key><string>false</string>
    <key>CI</key><string>1</string>
  </dict>
  <key>RunAtLoad</key><true/>
$extra
  <key>StandardOutPath</key><string>$LOGS/$name.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$name.log</string>
</dict>
</plist>
XML
}

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

load() { launchctl bootstrap "gui/$(id -u)" "$(plist "$1")" 2>/dev/null || launchctl load -w "$(plist "$1")"; }
unload() {
  [ -f "$(plist "$1")" ] || return 0
  launchctl bootout "gui/$(id -u)/$LABEL.$1" 2>/dev/null || launchctl unload -w "$(plist "$1")" 2>/dev/null || true
}

install() {
  [ "$(uname)" = Darwin ] || die "this script is for macOS."
  [ -f "$REPO/apps/api/.dev.vars" ] || die "apps/api/.dev.vars is missing (see docs/SETUP.md, 'Trying it on your computer')."
  [ -f "$REPO/apps/web/.env.local" ] || die "apps/web/.env.local is missing: cp apps/web/.env.example apps/web/.env.local"
  [ -d "$REPO/node_modules" ] || die "run 'npm install' in $REPO first."
  for s in "${SERVICES[@]}"; do unload "$s"; done
  for p in 8787 5173; do
    if port_busy "$p"; then die "port $p is in use. Stop the servers running in Terminal (Ctrl+C), then run this again."; fi
  done

  NODE_DIR="$(node_dir)"
  mkdir -p "$AGENTS" "$LOGS"
  local keep="  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>"
  write_plist api "$REPO/apps/api" "$keep" "$REPO/node_modules/.bin/wrangler" dev --port 8787 --ip 127.0.0.1
  write_plist web "$REPO/apps/web" "$keep" "$REPO/node_modules/.bin/vite" --port 5173 --strictPort --host 127.0.0.1
  write_plist updater "$REPO" "  <key>StartInterval</key><integer>600</integer>" \
    /usr/bin/curl -fsS --max-time 300 http://127.0.0.1:8787/cdn-cgi/local/scheduled
  for s in "${SERVICES[@]}"; do load "$s"; done

  echo "Orbit is starting in the background. Open http://localhost:5173 in a few seconds."
  echo "Logs: $LOGS  ·  Status: scripts/mac-background.sh status"
}

uninstall() {
  for s in "${SERVICES[@]}"; do unload "$s"; rm -f "$(plist "$s")"; done
  echo "Orbit's background services are stopped and removed. Your local data is kept."
}

status() {
  for s in "${SERVICES[@]}"; do
    if launchctl print "gui/$(id -u)/$LABEL.$s" >/dev/null 2>&1; then
      printf "%-8s loaded\n" "$s"
    else
      printf "%-8s not running\n" "$s"
    fi
  done
  if curl -fsS --max-time 3 http://127.0.0.1:8787/api/health >/dev/null 2>&1; then echo "API      answering"; else echo "API      not answering yet"; fi
  if curl -fsS --max-time 3 http://127.0.0.1:5173/ >/dev/null 2>&1; then echo "Web app  answering"; else echo "Web app  not answering yet"; fi
}

case "${1:-}" in
  install) install ;;
  uninstall) uninstall ;;
  restart) uninstall >/dev/null; install ;;
  status) status ;;
  logs) tail -n 40 -f "$LOGS"/*.log ;;
  *) echo "Usage: $0 install | uninstall | restart | status | logs"; exit 1 ;;
esac
