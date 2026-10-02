import { useCallback, useEffect, useState } from 'react';
import {
  addWishListItem,
  getPrintings,
  getWishList,
  removeWishListItem,
  updateWishListItem,
  type CardSuggestion,
  type WishListItem as WishListItemData,
} from '../api/client';
import CardSearch from './CardSearch';
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
function WishList() {
  const [items, setItems] = useState<WishListItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<WishListItemData | null>(null);

  useEffect(() => {
    let cancelled = false;

    getWishList()
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
  }, []);

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

      const response = await addWishListItem(mostRecentPrinting.scryfall_id);
      setItems((current) =>
        sortByName([...current.filter((item) => item.id !== response.data.id), response.data]),
      );
      setError(null);
    } catch {
      setError(`Unable to add ${card.name} to your wish list.`);
    }
  }, []);

  const handleFoilChange = useCallback((item: WishListItemData, foil: boolean) => {
    updateWishListItem(item.id, { foil })
      .then((response) => {
        setItems((current) => current.map((i) => (i.id === item.id ? response.data : i)));
      })
      .catch(() => setError('Unable to update the foil selection.'));
  }, []);

  const handleRemove = useCallback((item: WishListItemData) => {
    removeWishListItem(item.id)
      .then(() => {
        setItems((current) => current.filter((i) => i.id !== item.id));
      })
      .catch(() => setError('Unable to remove that card.'));
  }, []);

  const handlePrintingSelected = useCallback(
    (scryfallId: string) => {
      if (!activeItem) return;

      updateWishListItem(activeItem.id, { scryfallId })
        .then((response) => {
          setItems((current) =>
            current.map((i) => (i.id === activeItem.id ? response.data : i)),
          );
          setActiveItem(null);
        })
        .catch(() => setError('Unable to change the printing for that card.'));
    },
    [activeItem],
  );

  if (loading) {
    return <p>Loading your wish list…</p>;
  }

  return (
    <section aria-label="Wish list">
      <h2>Your wish list</h2>
      <CardSearch onSelectCard={handleSelectCard} />
      {error && <p role="alert">{error}</p>}
      <ul className="wish-list-grid" data-testid="wish-list-grid">
        {items.map((item) => (
          <WishListCard
            key={item.id}
            item={item}
            onFoilChange={(foil) => handleFoilChange(item, foil)}
            onRemove={() => handleRemove(item)}
            onOpenPrintings={() => setActiveItem(item)}
          />
        ))}
      </ul>
      {items.length === 0 && <p>Your wish list is empty. Search for a card to add one.</p>}
      {activeItem && (
        <PrintingModal
          key={activeItem.id}
          catalogId={activeItem.catalog_id}
          cardName={activeItem.card_name}
          onClose={() => setActiveItem(null)}
          onSelect={handlePrintingSelected}
        />
      )}
    </section>
  );
}

export default WishList;
