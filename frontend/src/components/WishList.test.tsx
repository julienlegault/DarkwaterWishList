import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WishList from './WishList';
import * as client from '../api/client';

vi.mock('../api/client', () => ({
  getWishList: vi.fn(),
  addWishListItem: vi.fn(),
  updateWishListItem: vi.fn(),
  removeWishListItem: vi.fn(),
  searchCards: vi.fn(),
  getPrintings: vi.fn(),
}));

const boltItem: client.WishListItem = {
  id: 1,
  catalog_id: 'oracle-bolt',
  scryfall_id: 'printing-new',
  card_name: 'Lightning Bolt',
  foil: false,
  foil_preference: 'nonfoil',
  any_printing: false,
  max_price_usd: null,
  any_printing_quantity: 1,
  selected_printings: [{ scryfall_id: 'printing-new', quantity: 1, foil_preference: 'nonfoil' }],
  tcgplayer_id: 123,
  in_stock: false,
  printing: {
    scryfall_id: 'printing-new',
    oracle_id: 'oracle-bolt',
    name: 'Lightning Bolt',
    set_code: 'm25',
    set_name: 'Masters 25',
    collector_number: '142',
    released_at: '2025-01-01',
    lang: 'en',
    tcgplayer_id: 123,
    image_uris: { normal: 'https://cards.example/bolt-new.jpg' },
    card_faces: null,
    finishes: ['nonfoil', 'foil'],
  },
  preview_printings: [{
    scryfall_id: 'printing-new',
    name: 'Lightning Bolt',
    image_uris: { normal: 'https://cards.example/bolt-new.jpg' },
    card_faces: null,
  }],
};

const list = { id: 7, name: 'My List', notify_me: false };
const renderWishList = () => render(<WishList list={list} busy={false} onNotifyChange={vi.fn()} onDelete={vi.fn()} />);

describe('WishList', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders the items already on the wish list', async () => {
    vi.mocked(client.getWishList).mockResolvedValue({ data: [boltItem] });

    renderWishList();

    expect(await screen.findByText('Lightning Bolt')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Lightning Bolt' }).querySelector('img')).toHaveAttribute(
      'src',
      'https://cards.example/bolt-new.jpg',
    );
  });

  it('adds a searched card to the wish list using its most recent printing', async () => {
    const user = userEvent.setup();
    vi.mocked(client.getWishList).mockResolvedValue({ data: [] });
    vi.mocked(client.searchCards).mockResolvedValue({
      data: [{ catalog_id: 'oracle-bolt', oracle_id: 'oracle-bolt', name: 'Lightning Bolt' }],
    });
    vi.mocked(client.getPrintings).mockResolvedValue({ data: [boltItem.printing!] });
    vi.mocked(client.addWishListItem).mockResolvedValue({ data: boltItem });

    renderWishList();

    await screen.findByText(/your wish list is empty/i);

    await user.type(screen.getByLabelText(/add a card/i), 'Lightning');
    const suggestion = await screen.findByRole('button', { name: 'Lightning Bolt' });
    await user.click(suggestion);

    await waitFor(() => expect(client.getPrintings).toHaveBeenCalledWith('oracle-bolt'));
    await waitFor(() => expect(client.addWishListItem).toHaveBeenCalledWith(7, 'printing-new'));
    expect(await screen.findByText('Lightning Bolt')).toBeInTheDocument();
  });

  it('removes an item from the wish list', async () => {
    const user = userEvent.setup();
    vi.mocked(client.getWishList).mockResolvedValue({ data: [boltItem] });
    vi.mocked(client.removeWishListItem).mockResolvedValue(undefined);

    renderWishList();
    await screen.findByText('Lightning Bolt');

    await user.click(screen.getByRole('button', { name: /remove lightning bolt/i }));

    await waitFor(() => expect(client.removeWishListItem).toHaveBeenCalledWith(7, 1));
    await waitFor(() => expect(screen.queryByText('Lightning Bolt')).not.toBeInTheDocument());
  });

  it('saves individual foil preferences and shows selected printings as stripes', async () => {
    const user = userEvent.setup();
    const altPrinting: client.Printing = {
      ...boltItem.printing!,
      scryfall_id: 'printing-old',
      set_name: 'Limited Edition Alpha',
      image_uris: { normal: 'https://cards.example/bolt-old.jpg' },
    };
    vi.mocked(client.getWishList).mockResolvedValue({ data: [boltItem] });
    vi.mocked(client.getPrintings).mockResolvedValue({
      data: [boltItem.printing!, altPrinting],
    });
    vi.mocked(client.updateWishListItem).mockResolvedValue({
      data: {
        ...boltItem,
        selected_printings: [
          { scryfall_id: 'printing-new', quantity: 1, foil_preference: 'foil' },
          { scryfall_id: 'printing-old', quantity: 3, foil_preference: 'either' },
        ],
        preview_printings: [boltItem.printing!, altPrinting],
      },
    });

    renderWishList();
    await screen.findByText('Lightning Bolt');

    await user.click(screen.getByRole('button', { name: /change printing/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Masters 25')).toBeInTheDocument();
    expect(within(dialog).queryByRole('combobox', { name: 'Foil' })).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText(/foil for masters 25/i), 'foil');
    await user.click(within(dialog).getByRole('checkbox', { name: /select limited edition alpha/i }));
    await user.selectOptions(within(dialog).getByLabelText(/foil for limited edition alpha/i), 'either');
    const altQuantity = within(dialog).getByLabelText(/quantity for limited edition alpha/i);
    await user.clear(altQuantity);
    await user.type(altQuantity, '3');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(client.updateWishListItem).toHaveBeenCalledWith(7, 1, {
        foil_preference: 'nonfoil',
        any_printing: false,
        max_price_usd: null,
        any_printing_quantity: 1,
        selected_printings: [
          { scryfall_id: 'printing-new', quantity: 1, foil_preference: 'foil' },
          { scryfall_id: 'printing-old', quantity: 3, foil_preference: 'either' },
        ],
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const images = screen.getByRole('img', { name: 'Lightning Bolt' }).querySelectorAll('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveStyle({ clipPath: 'inset(0 50% 0 0%)' });
    expect(images[1]).toHaveStyle({ clipPath: 'inset(0 0% 0 50%)' });
  });

  it('displays and saves the available finish for single-finish printings', async () => {
    const user = userEvent.setup();
    const foilOnly = { ...boltItem.printing!, finishes: ['foil'] };
    const nonfoilOnly = {
      ...boltItem.printing!, scryfall_id: 'nonfoil-only', set_name: 'Nonfoil set', finishes: ['nonfoil'],
    };
    const anotherFoilOnly = {
      ...boltItem.printing!, scryfall_id: 'foil-only', set_name: 'Foil set', finishes: ['foil'],
    };
    const unknownFinish = {
      ...boltItem.printing!, scryfall_id: 'unknown-finish', set_name: 'Unknown finish set', finishes: null,
    };
    vi.mocked(client.getWishList).mockResolvedValue({ data: [boltItem] });
    vi.mocked(client.getPrintings).mockResolvedValue({ data: [foilOnly, nonfoilOnly, anotherFoilOnly, unknownFinish] });
    vi.mocked(client.updateWishListItem).mockResolvedValue({ data: boltItem });

    renderWishList();
    await user.click(await screen.findByRole('button', { name: /change printing/i }));
    const dialog = screen.getByRole('dialog');
    const foilSelect = await within(dialog).findByLabelText(/foil for masters 25/i);
    expect(foilSelect).toHaveValue('foil');
    expect(foilSelect).toBeDisabled();
    expect(within(dialog).getByLabelText(/foil for nonfoil set/i)).toHaveValue('nonfoil');

    await user.click(within(dialog).getByRole('checkbox', { name: /select nonfoil set/i }));
    expect(within(dialog).getByLabelText(/foil for nonfoil set/i)).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: /select foil set/i }));
    expect(within(dialog).getByLabelText(/foil for foil set/i)).toHaveValue('foil');
    expect(within(dialog).getByLabelText(/foil for foil set/i)).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: /select unknown finish set/i }));
    expect(within(dialog).getByLabelText(/foil for unknown finish set/i)).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(client.updateWishListItem).toHaveBeenCalledWith(7, 1, expect.objectContaining({
      selected_printings: [
        { scryfall_id: 'printing-new', quantity: 1, foil_preference: 'foil' },
        { scryfall_id: 'nonfoil-only', quantity: 1, foil_preference: 'nonfoil' },
        { scryfall_id: 'foil-only', quantity: 1, foil_preference: 'foil' },
        { scryfall_id: 'unknown-finish', quantity: 1, foil_preference: 'nonfoil' },
      ],
    })));
  });

  it('toggles a printing from its card without toggling when editing its controls', async () => {
    const user = userEvent.setup();
    vi.mocked(client.getWishList).mockResolvedValue({ data: [boltItem] });
    vi.mocked(client.getPrintings).mockResolvedValue({ data: [boltItem.printing!] });
    renderWishList();
    await user.click(await screen.findByRole('button', { name: /change printing/i }));
    const dialog = screen.getByRole('dialog');
    const checkbox = await within(dialog).findByRole('checkbox', { name: /select masters 25/i });
    const image = within(dialog).getByRole('img', { name: /masters 25/i });
    const save = within(dialog).getByRole('button', { name: 'Save' });
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(save.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cancel.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(image);
    expect(checkbox).not.toBeChecked();
    await user.click(within(dialog).getByText('Masters 25'));
    expect(checkbox).toBeChecked();
    const quantity = within(dialog).getByLabelText(/quantity for masters 25/i);
    await user.clear(quantity);
    await user.type(quantity, '3');
    await user.selectOptions(within(dialog).getByLabelText(/foil for masters 25/i), 'foil');
    expect(checkbox).toBeChecked();
    expect(quantity).toHaveValue(3);

    await user.click(within(dialog).getByRole('switch', { name: 'Any Printing' }));
    await user.click(image);
    expect(checkbox).toBeChecked();
  });

  it('preserves specific selections when any printing is enabled and saves its price and quantity', async () => {
    const user = userEvent.setup();
    vi.mocked(client.getWishList).mockResolvedValue({ data: [boltItem] });
    vi.mocked(client.getPrintings).mockResolvedValue({ data: [boltItem.printing!] });
    vi.mocked(client.updateWishListItem).mockResolvedValue({ data: { ...boltItem, any_printing: true } });
    renderWishList();
    await user.click(await screen.findByRole('button', { name: /change printing/i }));
    const dialog = await screen.findByRole('dialog');
    const selection = await within(dialog).findByRole('checkbox', { name: /select masters 25/i });
    expect(selection).toBeChecked();
    expect(within(dialog).queryByLabelText(/printings under/i)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('switch', { name: 'Any Printing' }));
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Foil' }), 'either');
    expect(selection).toBeChecked();
    expect(selection).toBeDisabled();
    await user.click(within(dialog).getByRole('switch', { name: 'Any Printing' }));
    expect(selection).toBeEnabled();
    expect(selection).toBeChecked();
    expect(within(dialog).queryByLabelText(/printings under/i)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('switch', { name: 'Any Printing' }));
    await user.type(within(dialog).getByLabelText(/printings under/i), '12.50');
    const quantity = within(dialog).getByLabelText('Quantity');
    await user.clear(quantity);
    await user.type(quantity, '4');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(client.updateWishListItem).toHaveBeenCalledWith(7, 1, {
      foil_preference: 'either', any_printing: true, max_price_usd: '12.5', any_printing_quantity: 4,
      selected_printings: [{ scryfall_id: 'printing-new', quantity: 1, foil_preference: 'nonfoil' }],
    }));
  });

  it('updates the artwork when a single different printing is selected', async () => {
    const user = userEvent.setup();
    const alternate = {
      ...boltItem.printing!,
      scryfall_id: 'printing-old',
      set_name: 'Alpha',
      image_uris: { normal: 'https://cards.example/old.jpg' },
    };
    vi.mocked(client.getWishList).mockResolvedValue({ data: [boltItem] });
    vi.mocked(client.getPrintings).mockResolvedValue({ data: [boltItem.printing!, alternate] });
    vi.mocked(client.updateWishListItem).mockResolvedValue({
      data: { ...boltItem, scryfall_id: alternate.scryfall_id, preview_printings: [alternate] },
    });
    renderWishList();
    await user.click(await screen.findByRole('button', { name: /change printing/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(await within(dialog).findByRole('checkbox', { name: /select alpha/i }));
    await user.click(within(dialog).getByRole('checkbox', { name: /select masters 25/i }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(client.updateWishListItem).toHaveBeenCalledWith(7, 1, expect.objectContaining({
      scryfall_id: 'printing-old',
      selected_printings: [{ scryfall_id: 'printing-old', quantity: 1, foil_preference: 'nonfoil' }],
    })));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Lightning Bolt' }).querySelector('img')).toHaveAttribute('src', 'https://cards.example/old.jpg');
  });

  it('shows at most five preview slices when Any Printing is selected', async () => {
    const previews = Array.from({ length: 6 }, (_, index) => ({
      ...boltItem.preview_printings[0],
      scryfall_id: `printing-${index}`,
      image_uris: { normal: `https://cards.example/${index}.jpg` },
    }));
    vi.mocked(client.getWishList).mockResolvedValue({
      data: [{ ...boltItem, any_printing: true, preview_printings: previews }],
    });
    renderWishList();
    const artwork = await screen.findByRole('img', { name: 'Lightning Bolt' });
    const images = artwork.querySelectorAll('img');
    expect(images).toHaveLength(5);
    expect(images[0]).toHaveStyle({ clipPath: 'inset(0 80% 0 0%)' });
    expect(images[4]).toHaveStyle({ clipPath: 'inset(0 0% 0 80%)' });
  });
});
