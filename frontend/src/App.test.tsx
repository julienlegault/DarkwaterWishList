import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { addWishListItem } from './api/client';
import { Login } from './components/Login';

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
    vi.unstubAllEnvs();
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
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

  it('shows the login component when user is not authenticated', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByPath({
        '/health': { ok: true, json: () => ({ status: 'ok', timestamp: '2024-01-01T00:00:00Z' }) },
        '/user': { ok: false, status: 401 },
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it('initializes CSRF protection before submitting email login', async () => {
    vi.stubEnv('VITE_CODESPACE_LOGIN', 'true');
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => {
        document.cookie = 'XSRF-TOKEN=csrf%2Btoken; path=/';
        return { ok: true, status: 204 };
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<Login onSuccess={onSuccess} />);

    await user.type(screen.getByPlaceholderText(/enter your email/i), 'dev@example.com');
    await user.click(screen.getByRole('button', { name: /sign in with email/i }));

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/sanctum/csrf-cookie', { credentials: 'include' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/auth/local/login', expect.objectContaining({
      method: 'POST',
      headers: { Accept: 'application/json', 'X-XSRF-TOKEN': 'csrf+token' },
    }));
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('shows an error and does not sign in when the login request fails', async () => {
    vi.stubEnv('VITE_CODESPACE_LOGIN', 'true');
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => {
        document.cookie = 'XSRF-TOKEN=token; path=/';
        return { ok: true, status: 204 };
      })
      .mockResolvedValueOnce({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<Login onSuccess={onSuccess} />);

    await user.type(screen.getByPlaceholderText(/enter your email/i), 'dev@example.com');
    await user.click(screen.getByRole('button', { name: /sign in with email/i }));

    expect(await screen.findByText(/failed to sign in \(401\)/i)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('sends the CSRF token with authenticated API writes', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => {
        document.cookie = 'XSRF-TOKEN=write-token; path=/';
        return { ok: true, status: 204 };
      })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ data: {} }) });
    vi.stubGlobal('fetch', fetchMock);

    await addWishListItem('test-card');

    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining('/wishlist'), expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-XSRF-TOKEN': 'write-token' }),
    }));
  });
});
