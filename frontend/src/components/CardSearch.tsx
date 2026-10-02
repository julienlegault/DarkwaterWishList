import { useEffect, useRef, useState } from 'react';
import { searchCards, type CardSuggestion } from '../api/client';

interface CardSearchProps {
  onSelectCard: (card: CardSuggestion) => void;
}

/**
 * A text box that looks up card-name suggestions from the Scryfall catalog
 * as the user types, and reports the chosen card back to the parent.
 */
function CardSearch({ onSelectCard }: CardSearchProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CardSuggestion[]>([]);
  const latestRequestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return;
    }

    const requestId = ++latestRequestId.current;
    const timeoutId = setTimeout(() => {
      searchCards(trimmed)
        .then((response) => {
          if (latestRequestId.current === requestId) {
            setSuggestions(response.data ?? []);
          }
        })
        .catch(() => {
          if (latestRequestId.current === requestId) {
            setSuggestions([]);
          }
        });
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleSelect = (card: CardSuggestion) => {
    onSelectCard(card);
    setQuery('');
    setSuggestions([]);
  };

  return (
    <div className="card-search">
      <label htmlFor="card-search-input">Add a card to your wish list</label>
      <input
        id="card-search-input"
        type="text"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (value.trim().length === 0) {
            setSuggestions([]);
          }
        }}
        placeholder="Search for a card name…"
      />
      {suggestions.length > 0 && (
        <ul className="card-search-suggestions" role="listbox">
          {suggestions.map((card) => (
            <li key={card.catalog_id}>
              <button type="button" onClick={() => handleSelect(card)}>
                {card.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CardSearch;
