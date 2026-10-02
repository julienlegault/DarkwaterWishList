import { useEffect, useState } from 'react';
import { getPrintings, type Printing } from '../api/client';

interface PrintingModalProps {
  catalogId: string;
  cardName: string;
  onClose: () => void;
  onSelect: (scryfallId: string) => void;
}

/**
 * A modal showing every printing of a card as a grid of images, letting the
 * user pick which printing they want on their wish list.
 */
function PrintingModal({ catalogId, cardName, onClose, onSelect }: PrintingModalProps) {
  const [printings, setPrintings] = useState<Printing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getPrintings(catalogId)
      .then((response) => {
        if (!cancelled) setPrintings(response.data ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [catalogId]);

  return (
    <div className="printing-modal-backdrop">
      <div
        className="printing-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Choose a printing for ${cardName}`}
      >
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
        {loading && <p>Loading printings…</p>}
        <ul className="printing-modal-grid">
          {printings.map((printing) => {
            const image =
              printing.image_uris?.normal ??
              printing.card_faces?.[0]?.image_uris?.normal ??
              null;
            const label = `${printing.set_name ?? printing.set_code ?? printing.name}${printing.collector_number ? ` #${printing.collector_number}` : ''}`;

            return (
              <li key={printing.scryfall_id}>
                <button
                  type="button"
                  onClick={() => onSelect(printing.scryfall_id)}
                  aria-label={`Use the ${label} printing`}
                >
                  {image ? <img src={image} alt={label} /> : <span>{label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default PrintingModal;
