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
  readonly detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export async function csrfHeaders(): Promise<Record<string, string>> {
  const response = await fetch('/sanctum/csrf-cookie', { credentials: 'include' });
  if (!response.ok) {
    throw new ApiError(`Failed to initialize session (${response.status})`, response.status);
  }

  const token = document.cookie.split('; ').find((cookie) => cookie.startsWith('XSRF-TOKEN='));
  if (!token) {
    throw new Error('Failed to initialize session: CSRF cookie is missing.');
  }
  return { 'X-XSRF-TOKEN': decodeURIComponent(token.slice('XSRF-TOKEN='.length)) };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const csrf = init?.method && !['GET', 'HEAD', 'OPTIONS'].includes(init.method.toUpperCase())
    ? await csrfHeaders()
    : {};
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...csrf,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let detail: string | undefined;
    if (response.status === 422 && response.headers.get('content-type')?.includes('application/json')) {
      const body: { message?: string } = await response.json();
      detail = body.message;
    }
    throw new ApiError(
      `Request to ${path} failed with status ${response.status}`,
      response.status,
      detail,
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
  foil_preference: 'foil' | 'nonfoil' | 'either';
  any_printing: boolean;
  max_price_usd: string | null;
  any_printing_quantity: number;
  total_quantity: number;
  selected_printings: PrintingSelection[] | null;
  tcgplayer_id: number | null;
  in_stock: boolean;
  printing?: Printing | null;
  preview_printings: PreviewPrinting[];
}

export interface PreviewPrinting {
  scryfall_id: string;
  name: string;
  image_uris: ImageUris | null;
  card_faces: CardFace[] | null;
}

export interface PrintingSelection {
  scryfall_id: string;
  quantity: number;
  foil_preference: WishListItem['foil_preference'];
}

export interface WishListItemPreferences {
  foil_preference: WishListItem['foil_preference'];
  any_printing: boolean;
  max_price_usd: string | null;
  total_quantity: number;
  selected_printings: PrintingSelection[];
  scryfall_id?: string;
}

export interface WishList {
  id: number;
  name: string;
  notify_me: boolean;
}

export function getWishLists(): Promise<{ data: WishList[] }> {
  return request('/wish-lists');
}

export function createWishList(name: string): Promise<{ data: WishList }> {
  return request('/wish-lists', { method: 'POST', body: JSON.stringify({ name }) });
}

export function updateWishList(id: number, notifyMe: boolean): Promise<{ data: WishList }> {
  return request(`/wish-lists/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ notify_me: notifyMe }),
  });
}

export function deleteWishList(id: number, name: string): Promise<void> {
  return request(`/wish-lists/${id}`, { method: 'DELETE', body: JSON.stringify({ name }) });
}

export function getWishList(listId: number): Promise<{ data: WishListItem[] }> {
  return request(`/wish-lists/${listId}/items`);
}

/**
 * Adds a card (by its selected printing's Scryfall ID) to the authenticated
 * user's wish list. Adding a card already on the list updates its printing
 * and foil selection instead of creating a duplicate entry.
 */
export function addWishListItem(
  listId: number,
  scryfallId: string,
  foil = false,
): Promise<{ data: WishListItem }> {
  return request(`/wish-lists/${listId}/items`, {
    method: 'POST',
    body: JSON.stringify({ scryfall_id: scryfallId, foil }),
  });
}

export function addBulkWishListLine(listId: number, line: string): Promise<{ data: WishListItem }> {
  return request(`/wish-lists/${listId}/bulk-items`, {
    method: 'POST',
    body: JSON.stringify({ line }),
  });
}

/**
 * Updates an existing wish list item's printing and notification preferences.
 */
export function updateWishListItem(
  listId: number,
  id: number,
  updates: Partial<WishListItemPreferences>,
): Promise<{ data: WishListItem }> {
  return request(`/wish-lists/${listId}/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/**
 * Removes an item from the authenticated user's wish list.
 */
export function removeWishListItem(listId: number, id: number): Promise<void> {
  return request(`/wish-lists/${listId}/items/${id}`, { method: 'DELETE' });
}
