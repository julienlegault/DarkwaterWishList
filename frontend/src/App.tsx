import { useEffect, useState } from 'react';
import { getCurrentUser, type CurrentUser } from './api/client';
import WishLists from './components/WishLists';
import { Login } from './components/Login';

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
      <h1>Darkwater Wish List</h1>
      {user ? <WishLists /> : <Login onSuccess={handleLoginSuccess} />}
    </main>
  );
}

export default App;
