import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CARD_CONDITIONS, getPrintings, type CardCondition, type Printing, type WishListItem, type WishListItemPreferences } from '../api/client';

const conditionLabels: Record<CardCondition, string> = {
  near_mint: 'Near Mint',
  light_play: 'Light Play',
  moderate_play: 'Moderate Play',
  heavy_play: 'Heavy Play',
  damaged: 'Damaged',
};

function ConditionSelector({ label, value, onChange, disabled = false, className = '' }: {
  label: string;
  value: CardCondition[];
  onChange: (conditions: CardCondition[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pointerDownInside = useRef(false);
  const menuId = useId();
  const isOpen = open && !disabled;

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      pointerDownInside.current = event.target instanceof Node && !!containerRef.current?.contains(event.target);
      if (!pointerDownInside.current) setOpen(false);
    }
    function handlePointerUp(event: PointerEvent) {
      if (pointerDownInside.current && event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
      pointerDownInside.current = false;
    }
    function handlePointerCancel() {
      pointerDownInside.current = false;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
      document.removeEventListener('keydown', handleKeyDown);
      pointerDownInside.current = false;
    };
  }, [isOpen]);

  return (
    <div className={`condition-selector ${className}`} ref={containerRef}
      onBlur={(event) => {
        // A label click can blur the trigger before the checkbox receives its click.
        if (!pointerDownInside.current && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="preference-select condition-selector-trigger"
        aria-label={`Conditions for ${label}`}
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {value.length === CARD_CONDITIONS.length ? 'All' : value.length === 0 ? 'None' : `${value.length} selected`}
      </button>
      {isOpen && (
        <div id={menuId} className="condition-selector-menu" role="group" aria-label={`Conditions for ${label}`}>
          {CARD_CONDITIONS.map((condition) => (
            <label key={condition}>
              <input
                type="checkbox"
                checked={value.includes(condition)}
                onChange={(event) => onChange(event.target.checked
                  ? CARD_CONDITIONS.filter((option) => option === condition || value.includes(option))
                  : value.filter((option) => option !== condition))}
              />
              {conditionLabels[condition]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface PrintingModalProps {
  item: WishListItem;
  onClose: () => void;
  onSave: (preferences: WishListItemPreferences) => Promise<void>;
}

function singleFinish(printing: Printing | undefined): 'foil' | 'etched' | 'nonfoil' | undefined {
  const finishes = printing?.finishes;
  if (finishes?.length !== 1) return undefined;
  const finish = finishes[0];
  return finish === 'foil' || finish === 'etched' || finish === 'nonfoil' ? finish : undefined;
}

function PrintingModal({ item, onClose, onSave }: PrintingModalProps) {
  const [printings, setPrintings] = useState<Printing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [foil, setFoil] = useState<WishListItem['foil_preference']>(
    item.any_printing ? item.foil_preference : 'any',
  );
  const [anyPrinting, setAnyPrinting] = useState(item.any_printing);
  const [conditions, setConditions] = useState<CardCondition[]>(item.conditions ?? [...CARD_CONDITIONS]);
  const [price, setPrice] = useState(item.max_price_usd ?? '');
  const [quantity, setQuantity] = useState(String(item.total_quantity));
  const [selected, setSelected] = useState(() =>
    (item.selected_printings ?? [{ scryfall_id: item.scryfall_id, quantity: 1, foil_preference: item.foil_preference ?? 'any' }])
      .map((selection) => ({ ...selection, conditions: selection.conditions ?? [...CARD_CONDITIONS], quantity: String(selection.quantity), lastValidQuantity: selection.quantity })),
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
      foil_preference: anyPrinting ? foil : item.foil_preference,
      any_printing: anyPrinting,
      max_price_usd: price === '' ? null : price,
      total_quantity: Number(quantity),
      conditions,
      selected_printings: selected.map((selection) => ({
        scryfall_id: selection.scryfall_id,
        quantity: Number(selection.quantity),
        foil_preference: singleFinish(printings.find((printing) => printing.scryfall_id === selection.scryfall_id))
          ?? selection.foil_preference,
        conditions: selection.conditions,
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
                  <select className="preference-select" value={foil} onChange={(event) => setFoil(event.target.value as WishListItem['foil_preference'])}>
                    <option value="any">Any</option>
                    <option value="foil">Foil</option>
                    <option value="etched">Etched foil</option>
                    <option value="nonfoil">Non-foil</option>
                  </select>
                </label>
                <div className="printing-condition-setting">
                  <span>Conditions</span>
                  <ConditionSelector label="Any Printing" value={conditions} onChange={setConditions} disabled={saving} />
                </div>
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
                            {(finish === 'foil' || finish === 'etched' || (finish !== 'nonfoil' && (selection?.foil_preference === 'foil' || selection?.foil_preference === 'etched'))) && (
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
                              ? [...current, { scryfall_id: printing.scryfall_id, quantity: '1', lastValidQuantity: 1, foil_preference: finish ?? 'any', conditions: [...CARD_CONDITIONS] }]
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
                              {finish === 'foil' ? 'Foil only' : finish === 'etched' ? 'Etched foil only' : 'Non-foil only'}
                            </span>
                          ) : (
                            <select
                              className="printing-foil-selector preference-select"
                              aria-label={`Foil for ${label}`}
                              value={selection.foil_preference}
                              onChange={(event) => {
                                const value = event.target.value as WishListItem['foil_preference'];
                                setSelected((current) => current.map((entry) =>
                                  entry.scryfall_id === printing.scryfall_id ? { ...entry, foil_preference: value } : entry));
                              }}
                            >
                              <option value="any">Any</option>
                              <option value="foil">Foil</option>
                              {(printing.finishes?.includes('etched') || selection.foil_preference === 'etched') && <option value="etched">Etched foil</option>}
                              <option value="nonfoil">Non-foil</option>
                            </select>
                          )}
                          <ConditionSelector className="printing-condition-selector" label={label} value={selection.conditions}
                            disabled={anyPrinting || saving}
                            onChange={(conditions) => setSelected((current) => current.map((entry) =>
                              entry.scryfall_id === printing.scryfall_id ? { ...entry, conditions } : entry))}
                          />
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
