#!/usr/bin/env bash
# Runs Orbit on this Mac in the background (macOS LaunchAgents), so it keeps going after
# Terminal closes and starts again at login:
#   - the API on http://localhost:8787 (local database in apps/api/.wrangler)
#   - the web app on http://localhost:5173
#   - sync, every 15 seconds: keeps the code current. A quick check (`git ls-remote`, no download) asks GitHub
#     whether main moved; when it has, it pulls (fast-forward only, and only when this copy is on main with no
#     edits of yours), runs npm install and the database migrations when they changed, and restarts the API
#     when its code changed. The web app reloads by itself, so a merged PR shows up within seconds.
#   - the updater, every 10 minutes: runs the API's 10-minute job (linking, TV status), which local mode
#     doesn't do on its own. It also pulls, as a fallback, and installs the sync agent on Macs set up before it.
#
# Usage: scripts/mac-background.sh install | uninstall | restart | status | logs | update | sync
# Nothing runs while the Mac sleeps; it picks up again when it wakes.
set -euo pipefail

LABEL=com.orbit
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/orbit"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SERVICES=(api web updater sync)
SYNC_EVERY=15

die() { echo "orbit: $*" >&2; exit 1; }
plist() { echo "$AGENTS/$LABEL.$1.plist"; }

# launchd starts programs without your shell setup (nvm, etc.), so record where node and git are now.
node_dir() {
  local node
  node="$(command -v node)" || die "node not found. Open a Terminal where 'node -v' works and run this again."
  dirname "$node"
}
git_dir() {
  local git
  git="$(command -v git)" || die "git not found."
  dirname "$git"
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
    <key>PATH</key><string>$NODE_DIR:$GIT_DIR:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
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
  # Stopped servers can take a moment to let go of their ports.
  local p i
  for p in 8787 5173; do
    for i in $(seq 1 20); do port_busy "$p" || break; sleep 0.5; done
    if port_busy "$p"; then die "port $p is in use. Stop the servers running in Terminal (Ctrl+C), then run this again."; fi
  done

  NODE_DIR="$(node_dir)"
  GIT_DIR="$(git_dir)"
  mkdir -p "$AGENTS" "$LOGS"
  local keep="  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>"
  write_plist api "$REPO/apps/api" "$keep" "$REPO/node_modules/.bin/wrangler" dev --port 8787 --ip 127.0.0.1
  write_plist web "$REPO/apps/web" "$keep" "$REPO/node_modules/.bin/vite" --port 5173 --strictPort --host 127.0.0.1
  write_plist updater "$REPO" "  <key>StartInterval</key><integer>600</integer>" \
    /bin/bash "$REPO/scripts/mac-background.sh" update
  write_sync_plist
  for s in "${SERVICES[@]}"; do load "$s"; done

  echo "Orbit is starting in the background. Open http://localhost:5173 in a few seconds."
  echo "Logs: $LOGS  ·  Status: scripts/mac-background.sh status"
}

write_sync_plist() {
  write_plist sync "$REPO" "  <key>StartInterval</key><integer>$SYNC_EVERY</integer>" \
    /bin/bash "$REPO/scripts/mac-background.sh" sync
}

# Macs set up before the sync agent existed only have the 10-minute updater. It calls this, so they get the
# sync agent without anyone running `restart`. It touches only the sync agent, never the running updater.
ensure_sync() {
  [ -f "$(plist sync)" ] && return 0
  NODE_DIR="$(node_dir)"
  GIT_DIR="$(git_dir)"
  mkdir -p "$AGENTS" "$LOGS"
  write_sync_plist
  load sync && say "installed the sync agent: code updates now arrive within ${SYNC_EVERY} seconds"
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

say() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

# Restarts one background service, if it is installed.
kick() {
  launchctl kickstart -k "gui/$(id -u)/$LABEL.$1" >/dev/null 2>&1 && say "restarted $1" || say "couldn't restart $1"
}

# Logs a "skipped" reason only when it changes, so a check every 15 seconds doesn't fill the log.
NOTE_FILE="$LOGS/.last-sync-note"
say_once() {
  [ "$(cat "$NOTE_FILE" 2>/dev/null)" = "$*" ] && return 0
  mkdir -p "$LOGS"
  printf '%s' "$*" > "$NOTE_FILE"
  say "$*"
}

# Pulls new commits from origin/main and does whatever they need. Never touches a copy that is on another
# branch, has edits of yours, or has commits of its own: it says why in the log and leaves it alone.
pull_main() {
  cd "$REPO"
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$branch" != main ]; then say_once "code update skipped: on branch '$branch', not main"; return 0; fi
  if ! git diff --quiet || ! git diff --cached --quiet; then say_once "code update skipped: there are edits not committed"; return 0; fi
  git fetch --quiet origin main || { say_once "code update skipped: GitHub can't be reached"; return 0; }
  local old new
  old="$(git rev-parse HEAD)"
  new="$(git rev-parse origin/main)"
  [ "$old" = "$new" ] && return 0
  if ! git merge-base --is-ancestor "$old" "$new"; then say_once "code update skipped: main has commits that aren't on GitHub"; return 0; fi
  git merge --quiet --ff-only "$new" || { say_once "code update failed: couldn't fast-forward"; return 0; }
  rm -f "$NOTE_FILE"
  local changed
  changed="$(git diff --name-only "$old" "$new")"
  say "updated main ${old:0:7} -> ${new:0:7} ($(wc -l <<<"$changed" | tr -d ' ') files)"

  if grep -qE '(^|/)package(-lock)?\.json$' <<<"$changed"; then
    say "installing packages"
    npm install --no-audit --no-fund >/dev/null || say "npm install failed; see above"
  fi
  if grep -q '^apps/api/migrations/' <<<"$changed"; then
    say "updating the local database"
    (cd apps/api && "$REPO/node_modules/.bin/wrangler" d1 migrations apply orbit --local) >/dev/null || say "migrations failed"
  fi
  # The web app (Vite) reloads by itself; the API restarts when anything it runs on changed.
  if grep -qE '^(apps/api/|packages/|package(-lock)?\.json$)' <<<"$changed"; then kick api; fi
  if grep -qE '(^|/)package(-lock)?\.json$|^apps/web/vite\.config\.ts$' <<<"$changed"; then kick web; fi
  if grep -q '^scripts/mac-background\.sh$' <<<"$changed"; then
    say "note: this script changed; the next run uses the new version"
  fi
}

# One pull at a time: sync and the updater share this lock. A lock left by a crash is cleared after 10 minutes.
PULL_LOCK="${TMPDIR:-/tmp}/orbit-pull.lock"
locked_pull() {
  if [ -d "$PULL_LOCK" ] && [ -n "$(find "$PULL_LOCK" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then rmdir "$PULL_LOCK"; fi
  mkdir "$PULL_LOCK" 2>/dev/null || return 0
  pull_main || say "code update failed; see above"
  rmdir "$PULL_LOCK" 2>/dev/null || true
}

# Every 15 seconds: one small request to GitHub; pulls only when main moved.
sync() {
  cd "$REPO"
  local remote
  remote="$(git ls-remote --quiet origin refs/heads/main 2>/dev/null | cut -f1)" || true
  [ -n "$remote" ] || return 0
  [ "$remote" = "$(git rev-parse HEAD)" ] && return 0
  locked_pull
}

update() {
  local lock="${TMPDIR:-/tmp}/orbit-update.lock"
  mkdir "$lock" 2>/dev/null || { say "an update is still running; skipping"; return 0; }
  trap "rmdir '$lock'" EXIT
  ensure_sync || say "couldn't install the sync agent"
  locked_pull
  # The API may be restarting: give it a minute before the 10-minute job.
  local i
  for i in $(seq 1 12); do
    curl -fsS --max-time 3 http://127.0.0.1:8787/api/health >/dev/null 2>&1 && break
    sleep 5
  done
  curl -fsS --max-time 300 http://127.0.0.1:8787/cdn-cgi/local/scheduled >/dev/null || say "the 10-minute job didn't answer"
}

case "${1:-}" in
  install) install ;;
  uninstall) uninstall ;;
  restart) uninstall >/dev/null; install ;;
  status) status ;;
  logs) tail -n 40 -f "$LOGS"/*.log ;;
  update) update ;;
  sync) sync ;;
  *) echo "Usage: $0 install | uninstall | restart | status | logs | update | sync"; exit 1 ;;
esac
