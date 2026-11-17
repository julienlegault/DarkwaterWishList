import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addWishListItem,
  getPrintings,
  getWishList,
  removeWishListItem,
  updateWishListItem,
  type CardSuggestion,
  type WishList as WishListData,
  type WishListItem as WishListItemData,
  type WishListItemPreferences,
} from '../api/client';
import CardSearch from './CardSearch';
import BulkAddModal from './BulkAddModal';
import PrintingModal from './PrintingModal';
import WishListCard from './WishListCard';

function sortByName(items: WishListItemData[]): WishListItemData[] {
  return [...items].sort((a, b) => a.card_name.localeCompare(b.card_name));
}

/**
 * The authenticated user's wish list: a search box for adding cards, a grid
 * of the cards already on the list, and (when a card is selected) a modal
 * for choosing its printing.
 */
function WishList({ list, onNotifyChange, onDelete, busy }: {
  list: WishListData;
  onNotifyChange: (notify: boolean) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [items, setItems] = useState<WishListItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const generation = useRef(0);
  const loadingRef = useRef(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const mutations = useRef(new Map<number, { version: number; item: WishListItemData | null }>());
  const mutationVersion = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<WishListItemData | null>(null);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);

  const loadPage = useCallback(async (cursor?: string, reset = false) => {
    if (loadingRef.current && !reset) return;
    if (reset) generation.current++;
    const requestGeneration = generation.current;
    const requestVersion = mutationVersion.current;
    loadingRef.current = true;
    setLoading(true);
    setLoadError(null);
    try {
      const response = cursor ? await getWishList(list.id, cursor) : await getWishList(list.id);
      if (generation.current !== requestGeneration) return;
      setItems((current) => {
        const updated = [...mutations.current.entries()].filter(([, value]) => value.version > requestVersion);
        const changedIds = new Set(updated.map(([id]) => id));
        const loadedIds = new Set(response.data.map((item) => item.id));
        return sortByName([
          ...(reset ? [] : current.filter((item) => !loadedIds.has(item.id) && !changedIds.has(item.id))),
          ...response.data.filter((item) => !changedIds.has(item.id)),
          ...updated.flatMap(([, value]) => value.item ? [value.item] : []),
        ]);
      });
      setNextCursor(response.next_cursor ?? null);
    } catch {
      if (generation.current === requestGeneration) setLoadError('Unable to load your wishlist. Try again.');
    } finally {
      if (generation.current === requestGeneration) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [list.id]);

  useEffect(() => {
    const requestGeneration = generation;
    void loadPage(undefined, true);
    return () => { requestGeneration.current++; };
  }, [loadPage]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !nextCursor || loading || loadError || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadPage(nextCursor);
    }, { rootMargin: '300px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [nextCursor, loading, loadError, loadPage]);

  const handleSelectCard = useCallback(async (card: CardSuggestion) => {
    try {
      // Printings are returned most-recent-first, so the first result is
      // the card's most recent printing, used as the default selection.
      const printingsResponse = await getPrintings(card.catalog_id);
      const mostRecentPrinting = printingsResponse.data?.[0];
      if (!mostRecentPrinting) {
        setError(`No printings were found for ${card.name}.`);
        return;
      }

      const response = await addWishListItem(list.id, mostRecentPrinting.scryfall_id);
      mutations.current.set(response.data.id, { version: ++mutationVersion.current, item: response.data });
      setItems((current) =>
        sortByName([...current.filter((item) => item.id !== response.data.id), response.data]),
      );
      setError(null);
    } catch {
      setError(`Unable to add ${card.name} to your wishlist.`);
    }
  }, [list.id]);

  const handleRemove = useCallback((item: WishListItemData) => {
    removeWishListItem(list.id, item.id)
      .then(() => {
        mutations.current.set(item.id, { version: ++mutationVersion.current, item: null });
        setItems((current) => current.filter((i) => i.id !== item.id));
      })
      .catch(() => setError('Unable to remove that card.'));
  }, [list.id]);

  const handlePreferencesSaved = useCallback(
    async (preferences: WishListItemPreferences) => {
      if (!activeItem) throw new Error('No card selected.');
      const response = await updateWishListItem(list.id, activeItem.id, preferences);
      mutations.current.set(response.data.id, { version: ++mutationVersion.current, item: response.data });
      setItems((current) =>
        current.map((i) => (i.id === activeItem.id ? response.data : i)),
      );
      setError(null);
      setActiveItem(null);
    },
    [activeItem, list.id],
  );

  return (
    <section aria-label="Wish list">
      <h2>{list.name}</h2>
      <div className="list-toolbar">
        <label className="notify-toggle">
          <input type="checkbox" role="switch" disabled={busy} checked={list.notify_me} onChange={(event) => onNotifyChange(event.target.checked)} />
          Notify Me
        </label>
        <CardSearch onSelectCard={handleSelectCard} />
        <button type="button" className="button" onClick={() => setBulkAddOpen(true)}>Bulk Add</button>
        <button type="button" className="button button-danger" onClick={onDelete}>Delete List</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {loadError && <p role="alert">{loadError}</p>}
      <ul className="wish-list-grid" data-testid="wish-list-grid">
        {items.map((item) => (
          <WishListCard
            key={item.id}
            item={item}
            onRemove={() => handleRemove(item)}
            onOpenPrintings={() => setActiveItem(item)}
          />
        ))}
      </ul>
      {loading && <p role="status">Loading your wishlist…</p>}
      {!loading && !loadError && items.length === 0 && <p>Your wishlist is empty. Search for a card to add one.</p>}
      {(nextCursor || loadError) && (
        <div ref={loadMoreRef}>
          <button type="button" disabled={loading} onClick={() => void loadPage(nextCursor ?? undefined, !nextCursor)}>
            {loadError ? 'Retry loading' : 'Load more'}
          </button>
        </div>
      )}
      {bulkAddOpen && (
        <BulkAddModal listId={list.id} onClose={() => setBulkAddOpen(false)} onAdded={() => {
          void loadPage(undefined, true);
        }} />
      )}
      {activeItem && (
        <PrintingModal
          key={activeItem.id}
          item={activeItem}
          onClose={() => setActiveItem(null)}
          onSave={handlePreferencesSaved}
        />
      )}
    </section>
  );
}

export default WishList;
