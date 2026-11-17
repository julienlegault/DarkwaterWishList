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
      <footer className="site-footer">
        <p>
          This page is in Beta and cannot confirm that information presented is correct. Contact{' '}
          <a href="mailto:julien.p.legault@gmail.com">julien.p.legault@gmail.com</a> with any issues.
        </p>
        <p>
          <span className="footer-disclaimer-desktop">
            Portions of Darkwater Wishlist are unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. The literal and graphical information presented on this site about Magic: The Gathering, including card images and mana symbols, is copyright Wizards of the Coast, LLC. Darkwater Wishlist is not produced by or endorsed by Wizards of the Coast.
          </span>
          <span className="footer-disclaimer-mobile">
            Portions of Darkwater Wishlist are unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy.
          </span>
        </p>
      </footer>
    </main>
  );
}

export default App;
