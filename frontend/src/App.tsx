import { useEffect, useState } from 'react';
import { getCurrentUser, type CurrentUser } from './api/client';
import WishLists from './components/WishLists';
import { Login } from './components/Login';
import logo from './assets/DarkwaterLogo33.jxl';

function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [refreshUser, setRefreshUser] = useState(false);

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

  return (
    <main>
      <h1 className="app-title">
        <img src={logo} alt="Darkwater Wish List" />
      </h1>
      {user ? <WishLists /> : <Login onSuccess={handleLoginSuccess} />}
    </main>
  );
}

export default App;
