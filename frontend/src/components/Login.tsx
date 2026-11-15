import { useState } from 'react';
import { csrfHeaders } from '../api/client';

interface LoginProps {
  onSuccess: () => void;
}

export function Login({ onSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isCodespace = import.meta.env.VITE_CODESPACE_LOGIN === 'true';

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('email', email);

      const response = await fetch('/auth/local/login', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', ...await csrfHeaders() },
        body: formData,
      });

      if (!response.ok) {
        setError(`Failed to sign in (${response.status}). Please try again.`);
      } else {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <h2>Sign In</h2>

      <a href="/auth/google/redirect" className="button button-google">
        Sign in with Google
      </a>

      {isCodespace && (
        <>
          <div className="login-divider">
            <span>or for Codespace development</span>
          </div>

          <form onSubmit={handleLocalLogin}>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
            <button type="submit" disabled={loading} className="button button-local">
              {loading ? 'Signing in...' : 'Sign in with Email'}
            </button>
          </form>

          {error && <p className="error-message">{error}</p>}

          <p className="development-notice">
            💡 Email login is only available in GitHub Codespace development environments.
          </p>
        </>
      )}
    </div>
  );
}

