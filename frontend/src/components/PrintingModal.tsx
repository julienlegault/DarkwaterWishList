import { useEffect, useState, type FormEvent } from 'react';
import { getPrintings, type Printing, type WishListItem, type WishListItemPreferences } from '../api/client';

interface PrintingModalProps {
  item: WishListItem;
  onClose: () => void;
  onSave: (preferences: WishListItemPreferences) => Promise<void>;
}

function singleFinish(printing: Printing | undefined): 'foil' | 'nonfoil' | undefined {
  const hasFoil = printing?.finishes?.includes('foil');
  const hasNonfoil = printing?.finishes?.includes('nonfoil');
  return hasFoil === hasNonfoil ? undefined : hasFoil ? 'foil' : 'nonfoil';
}

function PrintingModal({ item, onClose, onSave }: PrintingModalProps) {
  const [printings, setPrintings] = useState<Printing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [foil, setFoil] = useState<WishListItem['foil_preference']>(item.foil_preference ?? 'either');
  const [anyPrinting, setAnyPrinting] = useState(item.any_printing);
  const [price, setPrice] = useState(item.max_price_usd ?? '');
  const [quantity, setQuantity] = useState(String(item.total_quantity));
  const [selected, setSelected] = useState(() =>
    (item.selected_printings ?? [{ scryfall_id: item.scryfall_id, quantity: 1, foil_preference: item.foil_preference ?? 'either' }])
      .map((selection) => ({ ...selection, quantity: String(selection.quantity), lastValidQuantity: selection.quantity })),
  );

  function changePrintingQuantity(id: string, value: string) {
    const selection = selected.find((entry) => entry.scryfall_id === id);
    if (!selection) return;
    const next = Number(value);
    const valid = /^\d+$/.test(value) && next >= 1 && next <= 4294967295;
    if (valid) {
      const difference = next - selection.lastValidQuantity;
      setQuantity((current) => /^-?\d+$/.test(current) ? String(Number(current) + difference) : current);
    }
    setSelected((current) => current.map((entry) => entry.scryfall_id === id
      ? { ...entry, quantity: value, lastValidQuantity: valid ? next : entry.lastValidQuantity }
      : entry));
  }

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
      setError('Enter a valid total quantity.');
      return;
    }
    setSaving(true);
    setError(null);
    const preferences: WishListItemPreferences = {
      foil_preference: foil,
      any_printing: anyPrinting,
      max_price_usd: price === '' ? null : price,
      total_quantity: Number(quantity),
      selected_printings: selected.map((selection) => ({
        scryfall_id: selection.scryfall_id,
        quantity: Number(selection.quantity),
        foil_preference: singleFinish(printings.find((printing) => printing.scryfall_id === selection.scryfall_id))
          ?? selection.foil_preference,
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
          <div className="dialog-actions">
            <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" disabled={saving || loading}>Save</button>
          </div>
          <div className="printing-modal-settings">
            <label className="notify-toggle">
              <input type="checkbox" role="switch" checked={anyPrinting} onChange={(event) => setAnyPrinting(event.target.checked)} />
              Any Printing
            </label>
            <label>
              Total Quantity
              <input type="number" min="1" max="4294967295" step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </label>
            {anyPrinting && (
              <>
                <label>
                  Foil
                  <select value={foil} onChange={(event) => setFoil(event.target.value as WishListItem['foil_preference'])}>
                    <option value="either">Either</option>
                    <option value="foil">Foil</option>
                    <option value="nonfoil">Non-foil</option>
                  </select>
                </label>
                <label>
                  Printings Under (USD)
                  <input type="number" min="0" max="99999999.99" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} />
                </label>
              </>
            )}
          </div>
          <p>Total Quantity can differ from the quantities on individual printings.</p>
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
                const finish = singleFinish(printing);
                const checkboxId = `printing-${printing.scryfall_id}`;

                return (
                  <li key={printing.scryfall_id} className="printing-option">
                    <div className="printing-option-image">
                      <label className="printing-image-label">
                        {image ? (
                          <span className="printing-artwork">
                            <img src={image} alt={label} />
                            {(finish === 'foil' || (finish !== 'nonfoil' && selection?.foil_preference === 'foil')) && (
                              <span className="foil-shine" aria-hidden="true" />
                            )}
                          </span>
                        ) : <span>{label}</span>}
                        <span className="printing-checkbox">
                          <input
                            id={checkboxId}
                            type="checkbox"
                            aria-label={`Select ${label}`}
                            checked={!!selection}
                            onChange={(event) => setSelected((current) => event.target.checked
                              ? [...current, { scryfall_id: printing.scryfall_id, quantity: '1', lastValidQuantity: 1, foil_preference: finish ?? 'either' }]
                              : current.filter((entry) => entry.scryfall_id !== printing.scryfall_id))}
                          />
                        </span>
                      </label>
                      {selection && (
                        <>
                          <input
                            className="printing-quantity"
                            aria-label={`Quantity for ${label}`}
                            type="number" min="1" max="4294967295" step="1" required
                            placeholder="Quantity"
                            value={selection.quantity}
                            onChange={(event) => changePrintingQuantity(printing.scryfall_id, event.target.value)}
                          />
                          {finish ? (
                            <span className="printing-foil-selector printing-foil-fixed">
                              {finish === 'foil' ? 'Foil only' : 'Non-foil only'}
                            </span>
                          ) : (
                            <select
                              className="printing-foil-selector"
                              aria-label={`Foil for ${label}`}
                              value={selection.foil_preference}
                              onChange={(event) => {
                                const value = event.target.value as WishListItem['foil_preference'];
                                setSelected((current) => current.map((entry) =>
                                  entry.scryfall_id === printing.scryfall_id ? { ...entry, foil_preference: value } : entry));
                              }}
                            >
                              <option value="either">Either</option>
                              <option value="foil">Foil</option>
                              <option value="nonfoil">Non-foil</option>
                            </select>
                          )}
                        </>
                      )}
                    </div>
                    <label className="printing-set" htmlFor={checkboxId}>{printing.set_name ?? printing.set_code ?? 'Unknown set'}</label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        </form>
      </div>
    </div>
  );
}

export default PrintingModal;
