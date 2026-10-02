import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

function mockFetchByPath(handlers: Record<string, { ok: boolean; status?: number; json?: () => unknown }>) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const match = Object.entries(handlers).find(([path]) => url.includes(path));
    const response = match?.[1] ?? { ok: false, status: 404 };

    return Promise.resolve({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => (response.json ? response.json() : {}),
    });
  });
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the backend status once the health check succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByPath({
        '/health': { ok: true, json: () => ({ status: 'ok', timestamp: '2024-01-01T00:00:00Z' }) },
        '/user': { ok: false, status: 401 },
      }),
    );

    render(<App />);

    expect(
      await screen.findByText(/Backend is healthy/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in with google/i })).toHaveAttribute(
      'href',
      '/auth/google/redirect',
    );
  });

  it('shows an error message when the health check fails', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByPath({
        '/health': { ok: false, status: 500 },
        '/user': { ok: false, status: 401 },
      }),
    );

    render(<App />);

    expect(
      await screen.findByText(/Unable to reach the backend API/i),
    ).toBeInTheDocument();
  });

  it('shows the wish list once the user is signed in', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByPath({
        '/health': { ok: true, json: () => ({ status: 'ok', timestamp: '2024-01-01T00:00:00Z' }) },
        '/user': { ok: true, json: () => ({ id: 1, name: 'Ash', email: 'ash@example.com' }) },
        '/wishlist': { ok: true, json: () => ({ data: [] }) },
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /your wish list/i }),
    ).toBeInTheDocument();
  });
});
