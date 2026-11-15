#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Configure FRONTEND_URL for GitHub Codespaces
if [[ -n "${CODESPACES:-}" ]]; then
    export FRONTEND_URL="https://${CODESPACE_NAME}-5173.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
fi

# Store process IDs for cleanup on script exit
declare -a pids=()

cleanup() {
    echo ""
    echo "Shutting down servers..."
    for pid in "${pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    wait "${pids[@]}" 2>/dev/null || true
    echo "✓ Servers stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

start_server() {
    local url="$1" log="$2" name="$3"
    shift 3
    
    if curl --silent --fail --max-time 2 "$url" > /dev/null 2>&1; then
        echo "✓ $name already running"
        return 0
    fi
    
    echo "Starting $name..."
    "$@" > "$log" 2>&1 &
    local pid=$!
    pids+=("$pid")
    
    for i in {1..30}; do
        if curl --silent --fail --max-time 2 "$url" > /dev/null 2>&1; then
            echo "✓ $name started (PID: $pid)"
            return 0
        fi
        
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "✗ $name process died unexpectedly" >&2
            break
        fi
        
        sleep 1
    done
    
    echo "✗ $name failed to start; see $log" >&2
    cat "$log" >&2
    return 1
}

start_server http://127.0.0.1:8000/api/health /tmp/darkwater-laravel.log "Laravel API" \
    php backend/artisan serve --host=0.0.0.0 --port=8000 --no-reload
start_server http://127.0.0.1:5173/ /tmp/darkwater-vite.log "Vite frontend" \
    npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173 --strictPort

echo ""
echo "✓ All servers started!"
echo "  • Laravel API: http://localhost:8000"
echo "  • Vite frontend: http://localhost:5173"
echo ""
echo "🔐 GitHub Codespace Email Login:"
echo "  In this GitHub Codespace environment, you can login with just an email address."
echo "  Simply enter any email address on the login page to create/access your account."
echo "  This email login feature is only available in GitHub Codespaces."
echo ""
echo "Press Ctrl+C to stop the servers"

# Keep the script running
wait
