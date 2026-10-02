import type { WishListItem } from '../api/client';

interface WishListCardProps {
  item: WishListItem;
  onFoilChange: (foil: boolean) => void;
  onRemove: () => void;
  onOpenPrintings: () => void;
}

/**
 * Renders a single wish list entry: the card's artwork (for the currently
 * selected printing), a foil/non-foil selector, and a button to remove the
 * card from the list. Clicking the artwork opens the printing-selection
 * modal.
 */
function WishListCard({ item, onFoilChange, onRemove, onOpenPrintings }: WishListCardProps) {
  const image =
    item.printing?.image_uris?.normal ??
    item.printing?.card_faces?.[0]?.image_uris?.normal ??
    null;

  return (
    <li className="wish-list-card">
      <button
        type="button"
        className="wish-list-card-image"
        onClick={onOpenPrintings}
        aria-label={`Change printing for ${item.card_name}`}
      >
        {image ? (
          <img src={image} alt={item.card_name} />
        ) : (
          <span className="wish-list-card-placeholder">{item.card_name}</span>
        )}
      </button>
      <p className="wish-list-card-name">{item.card_name}</p>
      <p className="wish-list-card-stock">
        {item.in_stock ? 'In stock at Darkwater' : 'Not currently in stock'}
      </p>
      <label>
        Foil
        <select
          value={item.foil ? 'foil' : 'nonfoil'}
          onChange={(event) => onFoilChange(event.target.value === 'foil')}
        >
          <option value="nonfoil">Non-foil</option>
          <option value="foil">Foil</option>
        </select>
      </label>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.card_name} from your wish list`}
      >
        🗑
      </button>
    </li>
  );
}

export default WishListCard;
