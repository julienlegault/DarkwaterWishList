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
  const stockStatus = item.in_stock ? 'In stock at Darkwater' : 'Not currently in stock';
  const images = item.preview_printings.map((printing) => ({
    id: printing.scryfall_id,
    image: printing.image_uris?.normal ?? printing.card_faces?.[0]?.image_uris?.normal ?? null,
  })).filter((printing): printing is { id: string; image: string } => printing.image !== null).slice(0, 5);

  return (
    <li className={`wish-list-card ${item.in_stock ? 'wish-list-card-in-stock' : 'wish-list-card-out-of-stock'}`} title={stockStatus}>
      <button
        type="button"
        className="wish-list-card-image"
        onClick={onOpenPrintings}
        aria-label={`Change printing for ${item.card_name}`}
      >
        {images.length > 0 ? (
          <span className="wish-list-card-artwork" role="img" aria-label={item.card_name}>
            {images.map(({ id, image }, index) => (
              <img
                key={`${id}-${index}`}
                src={image}
                alt=""
                style={{ clipPath: `inset(0 ${(images.length - index - 1) * 100 / images.length}% 0 ${index * 100 / images.length}%)` }}
              />
            ))}
            {images.map(({ id }, index) => {
              const preference = item.any_printing
                ? item.foil_preference
                : item.selected_printings?.find((selection) => selection.scryfall_id === id)?.foil_preference
                  ?? (item.selected_printings === null ? item.foil_preference : undefined);
              return preference === 'foil' || preference === 'etched' ? (
                <span
                  key={id}
                  className="foil-shine"
                  aria-hidden="true"
                  style={{ clipPath: `inset(0 ${(images.length - index - 1) * 100 / images.length}% 0 ${index * 100 / images.length}%)` }}
                />
              ) : null;
            })}
          </span>
        ) : (
          <span className="wish-list-card-placeholder">{item.card_name}</span>
        )}
      </button>
      <p className="wish-list-card-name">{item.card_name}</p>
      <p>Quantity requested: {item.total_quantity}</p>
      <span className="visually-hidden">{stockStatus}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.card_name} from your wishlist`}
      >
        🗑
      </button>
    </li>
  );
}

export default WishListCard;
