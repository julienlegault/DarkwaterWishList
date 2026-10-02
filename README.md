# Darkwater Wish List

A wish list application for Darkwater Games. Users will be able to track
trading cards they want, and receive an email notification when Darkwater's
inventory (via SortSwift) has the card in stock.

This repository is split into two independent projects:

```
backend/   Laravel API (PHP, SQLite)
frontend/  React + TypeScript app (Vite)
```

## Status

This PR establishes the application foundation only: a working Laravel API,
a working React/TypeScript frontend, a documented API boundary between them,
and basic health-check functionality with automated tests on both sides.
Authentication, card data, wish lists, and SortSwift integration are not yet
implemented.

## Local development

Run the backend and frontend in separate terminals.

### Backend (Laravel)

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate
php artisan serve
```

The API is served at `http://127.0.0.1:8000` with endpoints under `/api/*`.
See [`backend/README.md`](backend/README.md) for details.

### Frontend (React + TypeScript)

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The app is served at `http://localhost:5173` and proxies `/api/*` requests to
the backend during development. See
[`frontend/README.md`](frontend/README.md) for details.

## Tests

```bash
# Backend
cd backend && php artisan test

# Frontend
cd frontend && npm run test
```

## Configuration and secrets

Neither project commits its `.env` file. Copy the provided `.env.example`
files and adjust values locally; secrets must never be committed to source
control.
