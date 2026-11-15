#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

start_server() {
    local url="$1" log="$2"
    shift 2
    if curl --silent --fail --max-time 2 "$url" > /dev/null; then
        return
    fi
    nohup "$@" > "$log" 2>&1 < /dev/null &
    local pid=$!
    for _ in {1..30}; do
        if curl --silent --fail --max-time 2 "$url" > /dev/null; then
            return
        fi
        if ! kill -0 "$pid" 2>/dev/null; then
            break
        fi
        sleep 1
    done
    echo "Server failed to start; see $log" >&2
    cat "$log" >&2
    return 1
}

start_server http://127.0.0.1:8000/api/health /tmp/darkwater-laravel.log \
    php backend/artisan serve --host=0.0.0.0 --port=8000
start_server http://127.0.0.1:5173/ /tmp/darkwater-vite.log \
    npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173 --strictPort
