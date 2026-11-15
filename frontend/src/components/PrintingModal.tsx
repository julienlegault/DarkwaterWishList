import { useEffect, useState, type FormEvent } from 'react';
import { getPrintings, type Printing, type WishListItem, type WishListItemPreferences } from '../api/client';

interface PrintingModalProps {
  item: WishListItem;
  onClose: () => void;
  onSave: (preferences: WishListItemPreferences) => Promise<void>;
}

function PrintingModal({ item, onClose, onSave }: PrintingModalProps) {
  const [printings, setPrintings] = useState<Printing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [foil, setFoil] = useState(item.foil_preference);
  const [anyPrinting, setAnyPrinting] = useState(item.any_printing);
  const [price, setPrice] = useState(item.max_price_usd ?? '');
  const [quantity, setQuantity] = useState(String(item.any_printing_quantity));
  const [selected, setSelected] = useState(() =>
    (item.selected_printings ?? [{ scryfall_id: item.scryfall_id, quantity: 1, foil_preference: item.foil_preference }])
      .map((selection) => ({ ...selection, quantity: String(selection.quantity) })),
  );

  useEffect(() => {
    let cancelled = false;
    getPrintings(item.catalog_id)
      .then((response) => {
        if (!cancelled) setPrintings(response.data);
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load printings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [item.catalog_id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected.some((entry) => !/^\d+$/.test(entry.quantity) || Number(entry.quantity) < 1 || Number(entry.quantity) > 4294967295)) {
      setError('Enter a valid quantity for each selected printing.');
      return;
    }
    if (!/^\d+$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > 4294967295) {
      setError('Enter a valid quantity for Any Printing.');
      return;
    }
    setSaving(true);
    setError(null);
    const preferences: WishListItemPreferences = {
      foil_preference: foil,
      any_printing: anyPrinting,
      max_price_usd: price === '' ? null : price,
      any_printing_quantity: Number(quantity),
      selected_printings: selected.map((selection) => ({
        ...selection,
        quantity: Number(selection.quantity),
      })),
    };
    if (!anyPrinting && selected.length > 0 && !selected.some((selection) => selection.scryfall_id === item.scryfall_id)) {
      preferences.scryfall_id = selected[0].scryfall_id;
    }
    try {
      await onSave(preferences);
    } catch {
      setError('Unable to save printing preferences.');
      setSaving(false);
    }
  }

  return (
    <div className="printing-modal-backdrop">
      <div className="printing-modal printing-variant-modal" role="dialog" aria-modal="true" aria-label={`Choose a printing for ${item.card_name}`}>
        <form onSubmit={handleSubmit}>
          <div className="printing-modal-settings">
            <label className="notify-toggle">
              <input type="checkbox" role="switch" checked={anyPrinting} onChange={(event) => setAnyPrinting(event.target.checked)} />
              Any Printing
            </label>
            {anyPrinting && (
              <>
                <label>
                  Foil
                  <select value={foil} onChange={(event) => setFoil(event.target.value as WishListItem['foil_preference'])}>
                    <option value="nonfoil">Non-foil</option>
                    <option value="foil">Foil</option>
                    <option value="either">Either</option>
                  </select>
                </label>
                <label>
                  Printings Under (USD)
                  <input type="number" min="0" max="99999999.99" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} />
                </label>
                <label>
                  Quantity
                  <input type="number" min="1" max="4294967295" step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                </label>
              </>
            )}
          </div>
          <p>Notification delivery is not yet available. Your preferences will be saved.</p>
          {error && <p role="alert">{error}</p>}
          {loading && <p>Loading printings…</p>}
          <fieldset className="printing-options" disabled={anyPrinting || saving}>
            <legend>Specific printings</legend>
            <ul className="printing-modal-grid">
              {printings.map((printing) => {
                const image = printing.image_uris?.normal ?? printing.card_faces?.[0]?.image_uris?.normal ?? null;
                const label = `${printing.set_name ?? printing.set_code ?? printing.name}${printing.collector_number ? ` #${printing.collector_number}` : ''}`;
                const selection = selected.find((entry) => entry.scryfall_id === printing.scryfall_id);

                return (
                  <li key={printing.scryfall_id} className="printing-option">
                    <div className="printing-option-image">
                      {image ? <img src={image} alt={label} /> : <span>{label}</span>}
                      <label className="printing-checkbox">
                        <input
                          type="checkbox"
                          aria-label={`Select ${label}`}
                          checked={!!selection}
                          onChange={(event) => setSelected((current) => event.target.checked
                            ? [...current, { scryfall_id: printing.scryfall_id, quantity: '1', foil_preference: 'nonfoil' }]
                            : current.filter((entry) => entry.scryfall_id !== printing.scryfall_id))}
                        />
                      </label>
                      {selection && (
                        <input
                          className="printing-quantity"
                          aria-label={`Quantity for ${label}`}
                          type="number" min="1" max="4294967295" step="1" required
                          placeholder="Quantity"
                          value={selection.quantity}
                          onChange={(event) => setSelected((current) => current.map((entry) =>
                            entry.scryfall_id === printing.scryfall_id ? { ...entry, quantity: event.target.value } : entry))}
                        />
                      )}
                    </div>
                    <p className="printing-set">{printing.set_name ?? printing.set_code ?? 'Unknown set'}</p>
                    <label className="printing-foil">
                      Foil
                      <select
                        aria-label={`Foil for ${label}`}
                        value={selection?.foil_preference ?? 'nonfoil'}
                        disabled={!selection}
                        onChange={(event) => {
                          const value = event.target.value as WishListItem['foil_preference'];
                          setSelected((current) => current.map((entry) =>
                            entry.scryfall_id === printing.scryfall_id ? { ...entry, foil_preference: value } : entry));
                        }}
                      >
                        <option value="nonfoil">Non-foil</option>
                        <option value="foil">Foil</option>
                        <option value="either">Either</option>
                      </select>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <div className="dialog-actions">
            <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" disabled={saving || loading}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PrintingModal;
