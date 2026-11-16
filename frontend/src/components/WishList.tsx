import { useCallback, useEffect, useState } from 'react';
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
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<WishListItemData | null>(null);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getWishList(list.id)
      .then((response) => {
        if (!cancelled) setItems(sortByName(response.data ?? []));
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load your wish list.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [list.id]);

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
      setItems((current) =>
        sortByName([...current.filter((item) => item.id !== response.data.id), response.data]),
      );
      setError(null);
    } catch {
      setError(`Unable to add ${card.name} to your wish list.`);
    }
  }, [list.id]);

  const handleRemove = useCallback((item: WishListItemData) => {
    removeWishListItem(list.id, item.id)
      .then(() => {
        setItems((current) => current.filter((i) => i.id !== item.id));
      })
      .catch(() => setError('Unable to remove that card.'));
  }, [list.id]);

  const handlePreferencesSaved = useCallback(
    async (preferences: WishListItemPreferences) => {
      if (!activeItem) throw new Error('No card selected.');
      const response = await updateWishListItem(list.id, activeItem.id, preferences);
      setItems((current) =>
        current.map((i) => (i.id === activeItem.id ? response.data : i)),
      );
      setError(null);
      setActiveItem(null);
    },
    [activeItem, list.id],
  );

  if (loading) {
    return <p>Loading your wish list…</p>;
  }

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
      {items.length === 0 && <p>Your wish list is empty. Search for a card to add one.</p>}
      {bulkAddOpen && (
        <BulkAddModal listId={list.id} onClose={() => setBulkAddOpen(false)} onAdded={(item) => {
          setItems((current) => sortByName([...current.filter((entry) => entry.id !== item.id), item]));
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
