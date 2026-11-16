# Darkwater Wish List — Frontend

React + TypeScript frontend (built with Vite) for the Darkwater Wish List application.

## Requirements

- Node.js 20+ and npm

## Setup

```bash
cd frontend
npm install
cp .env.example .env
```

## Running the dev server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`. API requests to `/api/*`
are proxied to the Laravel backend at `http://127.0.0.1:8000` (see
`vite.config.ts`), so start the backend (`php artisan serve`) alongside the
frontend during local development.

## API boundary

The frontend talks to the backend exclusively through the client in
`src/api/client.ts`, which reads its base URL from `VITE_API_BASE_URL`
(defaults to `/api`, relying on the dev server proxy). See `backend/README.md`
for the list of available endpoints.

## Wish list

Once signed in, `src/components/WishList.tsx` renders the user's wish list:

- `CardSearch` looks up card-name suggestions from `/api/cards/search` as the
  user types.
- Selecting a suggestion fetches that card's printings
  (`/api/cards/{catalogId}/printings`) and adds the most recent one to the
  wish list via `/api/wishlist`.
- Bulk Add accepts one card per line, such as `2 Barbarian Ring (ODY) 313 *F*`.
  Quantity and printing are optional; `*F*` selects foil. Failed lines remain
  in the dialog while successfully added lines are removed.
- Each `WishListCard` shows the selected printings' artwork and a button to
  remove the card. Foil requests have a subtle rainbow shine on their artwork.
- Clicking a card's artwork opens `PrintingModal`, a grid of every printing
  for that card. The shine also marks foil-only printings and selected foil
  requests; the modal saves printing and finish preferences.

## Scripts

| Command           | Description                        |
| ----------------- | ----------------------------------- |
| `npm run dev`      | Start the Vite dev server           |
| `npm run build`    | Type-check and build for production |
| `npm run lint`     | Run oxlint                          |
| `npm run test`     | Run the Vitest test suite           |
| `npm run preview`  | Preview the production build        |
