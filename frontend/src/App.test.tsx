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
  it('shows the wish list once the user is signed in', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByPath({
        '/user': { ok: true, json: () => ({ id: 1, name: 'Ash', email: 'ash@example.com' }) },
        '/wish-lists': { ok: true, json: () => ({ data: [] }) },
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Lists' }),
    ).toBeInTheDocument();
  });

  it('shows the login component when user is not authenticated', async () => {
    const fetchMock = mockFetchByPath({
      '/user': { ok: false, status: 401 },
    });
    vi.stubGlobal(
      'fetch',
      fetchMock,
    );

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/backend status|application foundation/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/health'));
  });

  it('shows the beta and fan content note with a mailto contact link', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByPath({
        '/user': { ok: false, status: 401 },
      }),
    );

    render(<App />);

    const footer = await screen.findByRole('contentinfo');
    expect(footer.querySelectorAll('p')).toHaveLength(2);
    expect(footer).toHaveTextContent(
      'This page is in Beta and cannot confirm that information presented is correct. Contact julien.p.legault@gmail.com with any issues.',
    );
    expect(footer).toHaveTextContent(
      'Portions of Darkwater Wishlist are unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy.',
    );
    expect(footer.querySelector('.footer-disclaimer-mobile')).toHaveTextContent(
      'Portions of Darkwater Wishlist are unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy.',
    );
    expect(footer.querySelector('.footer-disclaimer-desktop')).toHaveTextContent(
      'Darkwater Wishlist is not produced by or endorsed by Wizards of the Coast.',
    );
    expect(screen.getByRole('link', { name: 'julien.p.legault@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:julien.p.legault@gmail.com',
    );
  });

  it('signs out with CSRF protection and stays signed out on reload', async () => {
    let signedIn = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/sanctum/csrf-cookie') {
        document.cookie = 'XSRF-TOKEN=logout-token; path=/';
        return { ok: true, status: 204 };
      }
      if (url === '/auth/logout') {
        signedIn = false;
        return { ok: true, status: 204 };
      }
      if (url.endsWith('/user')) {
        return { ok: signedIn, status: signedIn ? 200 : 401, json: async () => ({ id: 1, name: 'Ash', email: 'ash@example.com' }) };
      }
      if (url.endsWith('/wish-lists')) {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 1, name: 'List', notify_me: false }] }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.click(await screen.findByRole('button', { name: /log out/i }));

    expect(fetchMock).toHaveBeenCalledWith('/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'X-XSRF-TOKEN': 'logout-token' },
    });
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument();

    unmount();
    render(<App />);
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument();
  });

  it('keeps the user signed in and displays an error if logout fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/sanctum/csrf-cookie') {
        document.cookie = 'XSRF-TOKEN=logout-token; path=/';
        return { ok: true, status: 204 };
      }
      if (url === '/auth/logout') return { ok: false, status: 500 };
      if (url.endsWith('/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 1, name: 'Ash', email: 'ash@example.com' }) };
      }
      if (url.endsWith('/wish-lists')) {
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 1, name: 'List', notify_me: false }] }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /log out/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to sign out/i);
    expect(screen.getByRole('button', { name: /log out/i })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: /sign in/i })).not.toBeInTheDocument();
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

    await addWishListItem(1, 'test-card');

    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining('/wish-lists/1/items'), expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-XSRF-TOKEN': 'write-token' }),
    }));
  });
});
