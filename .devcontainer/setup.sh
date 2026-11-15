#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

cd backend
if [ ! -f .env ]; then
    cp .env.example .env
fi
composer install --no-interaction --prefer-dist
if grep -Eq '^APP_KEY=(|""|'\'\'')$' .env; then
    php artisan key:generate --no-interaction
fi
if [ ! -f database/database.sqlite ]; then
    touch database/database.sqlite
fi
php artisan migrate --force

cd ../frontend
if [ ! -f .env ]; then
    cp .env.example .env
fi
npm ci
