import { useState, type FormEvent } from 'react';
import { ApiError, addBulkWishListLines } from '../api/client';

function BulkAddModal({ listId, onClose, onAdded }: {
  listId: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length === 0) {
      setErrors(['Enter at least one card.']);
      return;
    }
    setSaving(true);
    setErrors([]);
    try {
      const { errors: failures } = await addBulkWishListLines(listId, lines);
      onAdded();
      if (failures.length === 0) {
        onClose();
      } else {
        setText(failures.map(({ index }) => lines[index]).join('\n'));
        setErrors(failures.map(({ index, message }) => `${lines[index]}: ${message}`));
        setSaving(false);
      }
    } catch (error) {
      setErrors([error instanceof ApiError && error.status === 422
        ? error.detail ?? 'Invalid bulk request.'
        : 'Unable to complete the request. Cards may have been added; reload and check the wish list before retrying.']);
      setSaving(false);
    }
  }

  return (
    <div className="printing-modal-backdrop">
      <div className="printing-modal bulk-add-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-add-title">
        <form onSubmit={handleSubmit}>
          <h2 id="bulk-add-title">Bulk Add</h2>
          <p>Enter one card per line. Quantity defaults to 1; add a set and collector number to select a printing, *F* for foil, or *E* for etched foil. Alternate names default to non-foil when available, otherwise foil or etched.</p>
          <label htmlFor="bulk-add-lines">Cards</label>
          <textarea id="bulk-add-lines" rows={12} value={text} onChange={(event) => setText(event.target.value)} disabled={saving}
            placeholder={'1 Apex Devastator (M3C) 220\n2 Barbarian Ring (ODY) 313 *F*'} />
          {errors.length > 0 && <div role="alert">{errors.map((error, index) => <p key={index}>{error}</p>)}</div>}
          <div className="dialog-actions">
            <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add Cards'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default BulkAddModal;
