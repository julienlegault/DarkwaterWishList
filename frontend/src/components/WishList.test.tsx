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
};

describe('WishList', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders the items already on the wish list', async () => {
    vi.mocked(client.getWishList).mockResolvedValue({ data: [boltItem] });

    render(<WishList />);

    expect(await screen.findByText('Lightning Bolt')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Lightning Bolt' })).toHaveAttribute(
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

    render(<WishList />);

    await screen.findByText(/your wish list is empty/i);

    await user.type(screen.getByLabelText(/add a card/i), 'Lightning');
    const suggestion = await screen.findByRole('button', { name: 'Lightning Bolt' });
    await user.click(suggestion);

    await waitFor(() => expect(client.getPrintings).toHaveBeenCalledWith('oracle-bolt'));
    await waitFor(() => expect(client.addWishListItem).toHaveBeenCalledWith('printing-new'));
    expect(await screen.findByText('Lightning Bolt')).toBeInTheDocument();
  });

  it('changes the foil selection for an item', async () => {
    const user = userEvent.setup();
    vi.mocked(client.getWishList).mockResolvedValue({ data: [boltItem] });
    vi.mocked(client.updateWishListItem).mockResolvedValue({
      data: { ...boltItem, foil: true },
    });

    render(<WishList />);
    await screen.findByText('Lightning Bolt');

    await user.selectOptions(screen.getByLabelText(/foil/i), 'foil');

    await waitFor(() =>
      expect(client.updateWishListItem).toHaveBeenCalledWith(1, { foil: true }),
    );
  });

  it('removes an item from the wish list', async () => {
    const user = userEvent.setup();
    vi.mocked(client.getWishList).mockResolvedValue({ data: [boltItem] });
    vi.mocked(client.removeWishListItem).mockResolvedValue(undefined);

    render(<WishList />);
    await screen.findByText('Lightning Bolt');

    await user.click(screen.getByRole('button', { name: /remove lightning bolt/i }));

    await waitFor(() => expect(client.removeWishListItem).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText('Lightning Bolt')).not.toBeInTheDocument());
  });

  it('changes the selected printing from the printing modal', async () => {
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
      data: { ...boltItem, scryfall_id: 'printing-old', printing: altPrinting },
    });

    render(<WishList />);
    await screen.findByText('Lightning Bolt');

    await user.click(screen.getByRole('button', { name: /change printing/i }));

    const dialog = await screen.findByRole('dialog');
    const altButton = within(dialog).getByRole('button', { name: /limited edition alpha/i });
    await user.click(altButton);

    await waitFor(() =>
      expect(client.updateWishListItem).toHaveBeenCalledWith(1, { scryfallId: 'printing-old' }),
    );
  });
});
