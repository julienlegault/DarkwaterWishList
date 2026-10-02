import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the backend status once the health check succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', timestamp: '2024-01-01T00:00:00Z' }),
      }),
    );

    render(<App />);

    expect(
      await screen.findByText(/Backend is healthy/i),
    ).toBeInTheDocument();
  });

  it('shows an error message when the health check fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    render(<App />);

    expect(
      await screen.findByText(/Unable to reach the backend API/i),
    ).toBeInTheDocument();
  });
});
