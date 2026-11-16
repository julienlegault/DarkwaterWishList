import { useEffect, useState } from 'react';
import { createWishList, deleteWishList, getWishLists, updateWishList, type WishList as WishListData } from '../api/client';
import WishList from './WishList';

function WishLists() {
  const [lists, setLists] = useState<WishListData[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<'create' | 'delete' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const selected = lists.find((list) => list.id === selectedId);

  useEffect(() => {
    let cancelled = false;

    async function loadLists() {
      try {
        const { data } = await getWishLists();
        if (cancelled) return;

        if (data.length === 0) {
          try {
            const { data: newList } = await createWishList('My Wishlist');
            if (!cancelled) {
              setLists([newList]);
              setSelectedId(newList.id);
            }
          } catch {
            if (!cancelled) setError('Unable to create default list.');
          }
        } else {
          setLists(data);
          setSelectedId(data[0].id);
        }
      } catch {
        if (!cancelled) setError('Unable to load your lists.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLists();
    return () => { cancelled = true; };
  }, []);

  function openDialog(mode: 'create' | 'delete') {
    setName('');
    setDialogError(null);
    setDialog(mode);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setDialogError(null);
    try {
      if (dialog === 'create') {
        const { data } = await createWishList(name);
        setLists((current) => [...current, data]);
        setSelectedId(data.id);
      } else if (dialog === 'delete' && selected) {
        await deleteWishList(selected.id, name);
        const remaining = lists.filter((list) => list.id !== selected.id);
        setLists(remaining);
        setSelectedId(remaining[0]?.id ?? null);
      }
      setDialog(null);
    } catch (caught) {
      if (caught instanceof Error && 'status' in caught && caught.status === 422) {
        setDialogError(dialog === 'delete' ? 'The list name does not match.' : 'Enter a name containing a letter or number.');
      } else {
        setDialogError(dialog === 'delete' ? 'Unable to delete the list.' : 'Unable to create the list.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleNotify(notify: boolean) {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await updateWishList(selected.id, notify);
      setLists((current) => current.map((list) => list.id === data.id ? data : list));
    } catch {
      setError('Unable to update notification settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lists-layout">
      <aside className="lists-panel" aria-label="Lists">
        <div className="lists-panel-heading">
          <h2>Lists</h2>
          <button type="button" aria-label="Add list" onClick={() => openDialog('create')}>+</button>
        </div>
        {loading && <p>Loading lists…</p>}
        <ul>
          {lists.map((list) => (
            <li key={list.id}>
              <button type="button" aria-current={list.id === selectedId ? 'true' : undefined} onClick={() => setSelectedId(list.id)}>
                {list.name}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="list-content">
        {error && <p role="alert">{error}</p>}
        {selected ? (
          <WishList key={selected.id} list={selected} busy={busy} onNotifyChange={handleNotify} onDelete={() => openDialog('delete')} />
        ) : !loading && <p>Select a list or add one to get started.</p>}
      </div>
      {dialog && (
        <div className="printing-modal-backdrop">
          <div className="printing-modal list-dialog" role="dialog" aria-modal="true" aria-labelledby="list-dialog-title" onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) setDialog(null);
          }}>
            <h2 id="list-dialog-title">{dialog === 'create' ? 'Add List' : 'Delete List'}</h2>
            {dialog === 'delete' && <p>Type the name of "{selected?.name}" to delete it and all its cards.</p>}
            <form onSubmit={submit}>
              <label htmlFor="list-name">{dialog === 'create' ? 'List name' : 'Confirm list name'}</label>
              <input id="list-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={255} required autoFocus />
              {dialogError && <p role="alert">{dialogError}</p>}
              <div className="dialog-actions">
                <button type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button>
                <button type="submit" disabled={busy} className={dialog === 'delete' ? 'button-danger' : ''}>
                  {dialog === 'create' ? 'Add List' : 'Delete List'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default WishLists;
