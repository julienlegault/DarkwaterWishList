import type { WishListItem } from '../api/client';

interface WishListCardProps {
  item: WishListItem;
  onRemove: () => void;
  onOpenPrintings: () => void;
}

/**
 * Renders a single wish list entry: the card's artwork (for the currently
 * selected printing) and a button to remove the
 * card from the list. Clicking the artwork opens the printing-selection
 * modal.
 */
function WishListCard({ item, onRemove, onOpenPrintings }: WishListCardProps) {
  const images = item.preview_printings.map((printing) =>
    printing.image_uris?.normal ?? printing.card_faces?.[0]?.image_uris?.normal ?? null,
  ).filter((image): image is string => image !== null).slice(0, 5);

  return (
    <li className="wish-list-card">
      <button
        type="button"
        className="wish-list-card-image"
        onClick={onOpenPrintings}
        aria-label={`Change printing for ${item.card_name}`}
      >
        {images.length > 0 ? (
          <span className="wish-list-card-artwork" role="img" aria-label={item.card_name}>
            {images.map((image, index) => (
              <img
                key={`${image}-${index}`}
                src={image}
                alt=""
                style={{ clipPath: `inset(0 ${(images.length - index - 1) * 100 / images.length}% 0 ${index * 100 / images.length}%)` }}
              />
            ))}
          </span>
        ) : (
          <span className="wish-list-card-placeholder">{item.card_name}</span>
        )}
      </button>
      <p className="wish-list-card-name">{item.card_name}</p>
      <p className="wish-list-card-stock">
        {item.in_stock ? 'In stock at Darkwater' : 'Not currently in stock'}
      </p>
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
