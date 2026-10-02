/**
 * Thin HTTP client for talking to the Laravel backend API.
 *
 * The frontend never calls the backend with a hard-coded origin. Instead it
 * uses `VITE_API_BASE_URL` (see `.env.example`) so the same build can target
 * different backend deployments without code changes. During local
 * development this defaults to `/api`, which Vite's dev server proxies to
 * the Laravel app (see `vite.config.ts`).
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    throw new ApiError(
      `Request to ${path} failed with status ${response.status}`,
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
}

/**
 * Calls the backend's `GET /api/health` endpoint.
 */
export function getHealth(): Promise<HealthCheckResponse> {
  return request<HealthCheckResponse>('/health');
}

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
}

/**
 * Fetches the signed-in user's identity. Throws an `ApiError` with status
 * 401 when nobody is signed in.
 */
export function getCurrentUser(): Promise<CurrentUser> {
  return request<CurrentUser>('/user');
}

export interface CardSuggestion {
  catalog_id: string;
  oracle_id: string | null;
  name: string;
}

/**
 * Looks up card-name suggestions as the user types, used to power the
 * wish list's autocomplete search box.
 */
export function searchCards(query: string): Promise<{ data: CardSuggestion[] }> {
  return request(`/cards/search?q=${encodeURIComponent(query)}`);
}

export interface ImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
}

export interface CardFace {
  name: string;
  image_uris?: ImageUris | null;
}

export interface Printing {
  scryfall_id: string;
  oracle_id: string | null;
  name: string;
  set_code: string | null;
  set_name: string | null;
  collector_number: string | null;
  released_at: string | null;
  lang: string | null;
  tcgplayer_id: number | null;
  image_uris: ImageUris | null;
  card_faces: CardFace[] | null;
  finishes: string[] | null;
}

/**
 * Fetches every printing of a card (identified by its oracle or Scryfall
 * ID), most recent first, for the printing-selection modal.
 */
export function getPrintings(catalogId: string): Promise<{ data: Printing[] }> {
  return request(`/cards/${encodeURIComponent(catalogId)}/printings`);
}

export interface WishListItem {
  id: number;
  catalog_id: string;
  scryfall_id: string;
  card_name: string;
  foil: boolean;
  tcgplayer_id: number | null;
  in_stock: boolean;
  printing?: Printing | null;
}

/**
 * Fetches the authenticated user's wish list.
 */
export function getWishList(): Promise<{ data: WishListItem[] }> {
  return request('/wishlist');
}

/**
 * Adds a card (by its selected printing's Scryfall ID) to the authenticated
 * user's wish list. Adding a card already on the list updates its printing
 * and foil selection instead of creating a duplicate entry.
 */
export function addWishListItem(
  scryfallId: string,
  foil = false,
): Promise<{ data: WishListItem }> {
  return request('/wishlist', {
    method: 'POST',
    body: JSON.stringify({ scryfall_id: scryfallId, foil }),
  });
}

/**
 * Updates an existing wish list item's printing and/or foil selection.
 */
export function updateWishListItem(
  id: number,
  updates: { scryfallId?: string; foil?: boolean },
): Promise<{ data: WishListItem }> {
  const body: Record<string, unknown> = {};
  if (updates.scryfallId !== undefined) body.scryfall_id = updates.scryfallId;
  if (updates.foil !== undefined) body.foil = updates.foil;

  return request(`/wishlist/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/**
 * Removes an item from the authenticated user's wish list.
 */
export function removeWishListItem(id: number): Promise<void> {
  return request(`/wishlist/${id}`, { method: 'DELETE' });
}
