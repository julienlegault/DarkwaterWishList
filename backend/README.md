# Darkwater Wish List — Backend

Laravel API backend for the Darkwater Wish List application, using SQLite for local development.

## Requirements

- PHP 8.3+
- Composer

## Setup

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate
```

`DB_CONNECTION=sqlite` is already set in `.env.example`, so no further database
configuration is required for local development.

## Running the server

```bash
php artisan serve
```

The API will be available at `http://127.0.0.1:8000`.

## API boundary

All API routes are defined in `routes/api.php` and served under the `/api`
prefix (configured in `bootstrap/app.php`). CORS is enabled for `api/*` via
Laravel's default `config/cors.php`-equivalent settings, allowing the
frontend dev server to call the API directly.

Available endpoints:

| Method | Path          | Description                                   |
| ------ | ------------- | ---------------------------------------------- |
| GET    | `/api/health` | Health check used by the frontend and monitors |

## Tests

```bash
php artisan test
```
