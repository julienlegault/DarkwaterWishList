# Darkwater Wish List — Backend

Laravel API backend for the Darkwater Wish List application, using SQLite for local development.

## Requirements

- PHP 8.5+
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
| GET, POST | `/api/wish-lists` | List or create the authenticated user's lists (`name`) |
| PATCH | `/api/wish-lists/{list}` | Update the list's `notify_me` preference |
| DELETE | `/api/wish-lists/{list}` | Delete a list and its items; provide its `name` for confirmation |
| GET, POST | `/api/wish-lists/{list}/items` | List items or add a card by `scryfall_id` |
| PATCH, DELETE | `/api/wish-lists/{list}/items/{item}` | Update or remove an item |

## Wish lists

Each wish list belongs to one user and has its own notification preference,
which defaults to on for new lists. Existing preferences are preserved.
The preference is stored but email delivery has not yet been implemented.
Deleting a list requires its name; matching ignores case and non-alphanumeric
characters. Names must contain at least one letter or number.
Existing wish list items are migrated into a list named "Wish List". The legacy
`/api/wishlist` endpoints operate on the user's first list (creating one if
necessary).

Each wish list item belongs to exactly one list and represents a single card
identity (grouped by Scryfall oracle ID, or the Scryfall printing ID when no
oracle ID is available). Adding a card already on the list updates the
existing entry's printing/foil selection instead of creating a duplicate.
Printings are validated against the `card_printings` catalog, and switching a
wish list item to a different printing is rejected unless the new printing
shares the same card identity. Each item stores a `tcgplayer_id` (nullable,
since not every printing has one) and an `in_stock` boolean that SortSwift
inventory webhooks will update. Wish list endpoints are scoped to the
authenticated user and selected list, so users cannot access another user's
lists or items, or access an item through a different list.

Item preferences include an Any Printing `foil_preference` (`foil`, `nonfoil`, or `either`),
`any_printing`, an optional `max_price_usd`, and `any_printing_quantity`.
`selected_printings` contains Scryfall IDs, positive quantities, and individual
`foil_preference` values for selected printings. Item responses also include up
to five `preview_printings`: selected printings in selection order, or the most
recent printings when Any Printing is enabled. Any Printing uses its own quantity and price limit; specific selections
are retained but inactive until it is turned off. Existing items start with their
previous printing selected at quantity one. These preferences are stored only:
inventory matching, quantity tracking, and notification delivery are not yet
implemented.

## Scryfall card catalog

The catalog stores paper card printings from Scryfall's `default_cards` bulk
dataset in SQLite. Each Scryfall printing ID is unique; oracle IDs group
printings for a card. Image URLs, face image data, finishes, release details,
and TCGplayer IDs (when supplied) are available from the printings endpoint.

Refresh the catalog from Scryfall's bulk-data API:

```bash
php artisan scryfall:refresh
```

To import a downloaded `default_cards` JSONL or JSONL.GZ file instead:

```bash
php artisan scryfall:refresh --file=/path/to/default-cards.jsonl.gz
```

The importer reads Scryfall's gzipped JSON Lines stream one card at a time
without extracting the archive or loading the full catalog into memory. Plain
JSONL and legacy JSON-array files are also accepted. Imports replace the catalog
in a transaction, so a failed or empty import does not leave a partially
refreshed catalog. The dev container and each Cloud Run instance refresh the
catalog on startup; an import failure prevents startup. Laravel's scheduler
also defines a weekly refresh. Run the scheduler continuously during local
development with `php artisan schedule:work`; in production, it runs only if
the standard Laravel `schedule:run` cron entry is configured every minute.

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
