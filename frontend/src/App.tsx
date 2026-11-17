import { useEffect, useState } from 'react';
import { getCurrentUser, logout, type CurrentUser } from './api/client';
import WishLists from './components/WishLists';
import { Login } from './components/Login';
import logo from './assets/DarkwaterLogo33.jxl';

function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [refreshUser, setRefreshUser] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');

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
  }, [refreshUser]);

  const handleLoginSuccess = () => {
    setRefreshUser((prev) => !prev);
  };

  const handleLogout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    setLogoutError('');
    try {
      await logout();
      setUser(null);
    } catch {
      setLogoutError('Unable to sign out. Please try again.');
    } finally {
      setLogoutBusy(false);
    }
  };

  return (
    <main>
      <header className="app-header">
        <h1 className="app-title">
          <img src={logo} alt="Darkwater Wishlist" />
        </h1>
        {user && (
          <button type="button" onClick={handleLogout} disabled={logoutBusy}>
            {logoutBusy ? 'Signing out...' : 'Log out'}
          </button>
        )}
      </header>
      {logoutError && <p className="error-message" role="alert">{logoutError}</p>}
      {user ? <WishLists /> : <Login onSuccess={handleLoginSuccess} />}
    </main>
  );
}

export default App;
