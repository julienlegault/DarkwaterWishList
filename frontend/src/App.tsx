import { useEffect, useState } from 'react';
import { getCurrentUser, getHealth, type CurrentUser } from './api/client';
import WishList from './components/WishList';

type Status = 'loading' | 'ok' | 'error';

function App() {
  const [status, setStatus] = useState<Status>('loading');
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then((health) => {
        if (cancelled) return;
        setStatus('ok');
        setTimestamp(health.timestamp);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((currentUser) => {
        if (!cancelled) setUser(currentUser);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Darkwater Wish List</h1>
      <a href="/auth/google/redirect">Sign in with Google</a>
      <p>Application foundation: Laravel backend + React/TypeScript frontend.</p>
      <section aria-live="polite">
        <h2>Backend status</h2>
        {status === 'loading' && <p>Checking backend health…</p>}
        {status === 'ok' && (
          <p data-testid="health-status">
            Backend is healthy (last checked {timestamp}).
          </p>
        )}
        {status === 'error' && (
          <p data-testid="health-status">
            Unable to reach the backend API. Is the Laravel server running?
          </p>
        )}
      </section>
      {user && <WishList />}
    </main>
  );
}

export default App;
