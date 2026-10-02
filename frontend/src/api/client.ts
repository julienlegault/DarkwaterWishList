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
