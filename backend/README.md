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
| GET    | `/api/user`   | Authenticated user's identity                 |
| GET    | `/api/cards/search?q={name}` | Authenticated card-name suggestions |
| GET    | `/api/cards/{catalogId}/printings` | Authenticated printings for an oracle or Scryfall ID |

## Scryfall card catalog

The catalog stores paper card printings from Scryfall's `default_cards` bulk
dataset in SQLite. Each Scryfall printing ID is unique; oracle IDs group
printings for a card. Image URLs, face image data, finishes, release details,
and TCGplayer IDs (when supplied) are available from the printings endpoint.

Refresh the catalog from Scryfall's bulk-data API:

```bash
php artisan scryfall:refresh
```

To import a downloaded `default_cards` JSON file instead:

```bash
php artisan scryfall:refresh --file=/path/to/default-cards.json
```

Imports replace the catalog in a transaction, so a failed or empty import does
not leave a partially refreshed catalog. Laravel's scheduler refreshes the
catalog weekly. Run the scheduler continuously during local development with
`php artisan schedule:work`; in production, configure the standard Laravel
`schedule:run` cron entry to run every minute.

## Google sign-in

Create an OAuth 2.0 **Web application** client in the Google Cloud Console.
Add the backend callback URL (the value of `GOOGLE_REDIRECT_URI`, by default
`http://localhost:8000/auth/google/callback`) to its authorized redirect URIs.
Copy the client ID and secret into `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` in `backend/.env`; never commit these credentials.

Set `APP_URL` to the public backend URL, `FRONTEND_URL` to the frontend URL, and
include the frontend host and port in `SANCTUM_STATEFUL_DOMAINS`. The frontend
starts sign-in at `/auth/google/redirect`. Laravel creates or reuses the user
by Google's verified email and establishes a session. The session-protected
`GET /api/user` endpoint returns the signed-in user's identity.

For local development, the example environment uses `http://localhost:8000`
for Laravel and `http://localhost:5173` for Vite. Register
`http://localhost:8000/auth/google/callback` with Google and provide OAuth
credentials in the untracked `.env` file.

## Tests

```bash
php artisan test
```
