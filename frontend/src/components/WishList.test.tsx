import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WishList from './WishList';
import WishListCard from './WishListCard';
import * as client from '../api/client';

vi.mock('../api/client', async (importOriginal) => ({
  ...await importOriginal<typeof client>(),
  getWishList: vi.fn(),
  addWishListItem: vi.fn(),
  addBulkWishListLines: vi.fn(),
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
  total_quantity: 1,
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
    vi.unstubAllGlobals();
  });

  it('renders the items already on the wish list', async () => {
    vi.mocked(client.getWishList).mockResolvedValue({ data: [boltItem] });

    renderWishList();

    expect(await screen.findByText('Lightning Bolt')).toBeInTheDocument();
    expect(screen.getByText('Quantity requested: 1')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Lightning Bolt' }).querySelector('img')).toHaveAttribute(
      'src',
      'https://cards.example/bolt-new.jpg',
    );
  });

  it('indicates stock status with a border and accessible text', () => {
    const { rerender } = render(<WishListCard item={boltItem} onRemove={vi.fn()} onOpenPrintings={vi.fn()} />);
    const card = screen.getByRole('listitem');
    expect(card).toHaveClass('wish-list-card-out-of-stock');
    expect(card).toHaveAttribute('title', 'Not currently in stock');
    expect(screen.getByText('Not currently in stock')).toHaveClass('visually-hidden');

    rerender(<WishListCard item={{ ...boltItem, in_stock: true }} onRemove={vi.fn()} onOpenPrintings={vi.fn()} />);
    expect(card).toHaveClass('wish-list-card-in-stock');
    expect(card).not.toHaveClass('wish-list-card-out-of-stock');
    expect(card).toHaveAttribute('title', 'In stock at Darkwater');
    expect(screen.getByText('In stock at Darkwater')).toHaveClass('visually-hidden');
  });

  it('shows foil shine only on the matching visible printing stripes', () => {
    const item: client.WishListItem = {
      ...boltItem,
      selected_printings: [
        { scryfall_id: 'missing-image', quantity: 1, foil_preference: 'foil' },
        { scryfall_id: 'printing-new', quantity: 1, foil_preference: 'nonfoil' },
        { scryfall_id: 'printing-old', quantity: 1, foil_preference: 'foil' },
      ],
      preview_printings: [
        { ...boltItem.preview_printings[0], scryfall_id: 'missing-image', image_uris: null },
        boltItem.preview_printings[0],
        { ...boltItem.preview_printings[0], scryfall_id: 'printing-old' },
      ],
    };
    const { rerender } = render(<WishListCard item={item} onRemove={vi.fn()} onOpenPrintings={vi.fn()} />);
    const artwork = screen.getByRole('img', { name: 'Lightning Bolt' });
    expect(artwork.querySelectorAll('.foil-shine')).toHaveLength(1);
    expect(artwork.querySelector('.foil-shine')).toHaveStyle({ clipPath: 'inset(0 0% 0 50%)' });

    rerender(<WishListCard item={{ ...item, any_printing: true, foil_preference: 'foil' }} onRemove={vi.fn()} onOpenPrintings={vi.fn()} />);
    expect(artwork.querySelectorAll('.foil-shine')).toHaveLength(2);
    rerender(<WishListCard item={{ ...item, any_printing: true, foil_preference: 'any' }} onRemove={vi.fn()} onOpenPrintings={vi.fn()} />);
    expect(artwork.querySelectorAll('.foil-shine')).toHaveLength(0);
    rerender(<WishListCard item={{ ...boltItem, selected_printings: null, foil_preference: 'foil' }} onRemove={vi.fn()} onOpenPrintings={vi.fn()} />);
    expect(artwork.querySelectorAll('.foil-shine')).toHaveLength(1);
  });

  it('keeps only failed lines, adds successful cards, and closes after retry', async () => {
    const user = userEvent.setup();
    vi.mocked(client.getWishList)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [boltItem] })
      .mockResolvedValueOnce({ data: [{ ...boltItem, total_quantity: 2 }] });
    vi.mocked(client.addBulkWishListLines)
      .mockResolvedValueOnce({ errors: [{ index: 1, message: 'Card not found.' }] })
      .mockResolvedValueOnce({ errors: [] });
    renderWishList();
    await user.click(await screen.findByRole('button', { name: 'Bulk Add' }));
    const input = screen.getByRole('textbox', { name: 'Cards' });
    fireEvent.change(input, { target: { value: '1 Lightning Bolt (M25) 142\nUnknown Card' } });
    await user.click(screen.getByRole('button', { name: 'Add Cards' }));
    await waitFor(() => expect(input).toHaveValue('Unknown Card'));
    expect(screen.getByRole('alert')).toHaveTextContent('Card not found.');
    expect(await screen.findByText('Lightning Bolt')).toBeInTheDocument();
    expect(client.addBulkWishListLines).toHaveBeenCalledWith(7, ['1 Lightning Bolt (M25) 142', 'Unknown Card']);
    await user.click(screen.getByRole('button', { name: 'Add Cards' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Quantity requested: 2')).toBeInTheDocument();
  });

  it('preserves lines after an uncertain batch request', async () => {
    const user = userEvent.setup();
    vi.mocked(client.getWishList).mockResolvedValue({ data: [] });
    vi.mocked(client.addBulkWishListLines).mockRejectedValueOnce(new Error('Network error'));
    renderWishList();
    await user.click(await screen.findByRole('button', { name: 'Bulk Add' }));
    const input = screen.getByRole('textbox', { name: 'Cards' });
    fireEvent.change(input, { target: { value: 'First card\nSecond card' } });
    await user.click(screen.getByRole('button', { name: 'Add Cards' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('may have been added');
    expect(input).toHaveValue('First card\nSecond card');
    expect(client.addBulkWishListLines).toHaveBeenCalledTimes(1);
  });

  it('loads the next page on demand and offers a retry after a page error', async () => {
    const user = userEvent.setup();
    vi.mocked(client.getWishList)
      .mockResolvedValueOnce({ data: [boltItem], next_cursor: 'next' })
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ data: [{ ...boltItem, id: 2, card_name: 'Other Card' }], next_cursor: null });
    renderWishList();
    await screen.findByText('Lightning Bolt');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load');
    await user.click(screen.getByRole('button', { name: 'Retry loading' }));
    expect(await screen.findByText('Other Card')).toBeInTheDocument();
    expect(client.getWishList).toHaveBeenLastCalledWith(7, 'next');
    expect(screen.getByText('Lightning Bolt')).toBeInTheDocument();
  });

  it('loads the next page when the end of the list is visible', async () => {
    let notify: IntersectionObserverCallback | undefined;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe() {}
      disconnect() {}
    });
    vi.mocked(client.getWishList)
      .mockResolvedValueOnce({ data: [boltItem], next_cursor: 'next' })
      .mockResolvedValueOnce({ data: [{ ...boltItem, id: 2, card_name: 'Other Card' }] });
    renderWishList();
    await screen.findByText('Lightning Bolt');
    await waitFor(() => expect(notify).toBeDefined());
    act(() => notify!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(await screen.findByText('Other Card')).toBeInTheDocument();
    expect(client.getWishList).toHaveBeenLastCalledWith(7, 'next');
  });

  it('closes the bulk modal before the refreshed page finishes loading', async () => {
    const user = userEvent.setup();
    let finishRefresh: (response: { data: client.WishListItem[] }) => void = () => {};
    vi.mocked(client.getWishList)
      .mockResolvedValueOnce({ data: [] })
      .mockReturnValueOnce(new Promise((resolve) => { finishRefresh = resolve; }));
    vi.mocked(client.addBulkWishListLines).mockResolvedValue({ errors: [] });
    renderWishList();
    await user.click(await screen.findByRole('button', { name: 'Bulk Add' }));
    await user.type(screen.getByRole('textbox', { name: 'Cards' }), 'Lightning Bolt');
    await user.click(screen.getByRole('button', { name: 'Add Cards' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    await act(async () => finishRefresh({ data: [boltItem] }));
    expect(screen.getByText('Lightning Bolt')).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: /change printing/i }));
    await user.click(screen.getByRole('switch', { name: 'Any Printing' }));
    expect(screen.getByLabelText('Total Quantity')).toHaveValue(1);
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
          { scryfall_id: 'printing-old', quantity: 3, foil_preference: 'any' },
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
    const selectedArtwork = within(dialog).getByRole('img', { name: /masters 25/i }).parentElement!;
    expect(selectedArtwork.querySelector('.foil-shine')).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText(/foil for masters 25/i), 'foil');
    expect(selectedArtwork.querySelector('.foil-shine')).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText(/foil for masters 25/i), 'any');
    expect(selectedArtwork.querySelector('.foil-shine')).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText(/foil for masters 25/i), 'foil');
    await user.click(within(dialog).getByRole('checkbox', { name: /select limited edition alpha/i }));
    await user.selectOptions(within(dialog).getByLabelText(/foil for limited edition alpha/i), 'any');
    const altQuantity = within(dialog).getByLabelText(/quantity for limited edition alpha/i);
    await user.clear(altQuantity);
    await user.type(altQuantity, '3');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(client.updateWishListItem).toHaveBeenCalledWith(7, 1, {
        foil_preference: 'nonfoil',
        any_printing: false,
        max_price_usd: null,
        total_quantity: 3,
        selected_printings: [
          { scryfall_id: 'printing-new', quantity: 1, foil_preference: 'foil' },
          { scryfall_id: 'printing-old', quantity: 3, foil_preference: 'any' },
        ],
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const images = screen.getByRole('img', { name: 'Lightning Bolt' }).querySelectorAll('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveStyle({ clipPath: 'inset(0 50% 0 0%)' });
    expect(images[1]).toHaveStyle({ clipPath: 'inset(0 0% 0 50%)' });
    const shine = screen.getByRole('img', { name: 'Lightning Bolt' }).querySelectorAll('.foil-shine');
    expect(shine).toHaveLength(1);
    expect(shine[0]).toHaveStyle({ clipPath: 'inset(0 50% 0 0%)' });
  });

  it.each([1, 10])('saves and displays a total of %i for three selected printings', async (total) => {
    const user = userEvent.setup();
    const second = { ...boltItem.printing!, scryfall_id: 'second', set_name: 'Second' };
    const third = { ...boltItem.printing!, scryfall_id: 'third', set_name: 'Third' };
    vi.mocked(client.getWishList).mockResolvedValue({ data: [boltItem] });
    vi.mocked(client.getPrintings).mockResolvedValue({ data: [boltItem.printing!, second, third] });
    vi.mocked(client.updateWishListItem).mockImplementation(async (_listId, _id, preferences) => ({
      data: { ...boltItem, ...preferences, preview_printings: [boltItem.printing!, second, third] },
    }));

    renderWishList();
    await user.click(await screen.findByRole('button', { name: /change printing/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(await within(dialog).findByRole('checkbox', { name: /select second/i }));
    await user.click(within(dialog).getByRole('checkbox', { name: /select third/i }));
    const quantity = within(dialog).getByLabelText('Total Quantity');
    expect(quantity).toHaveValue(1);
    if (total !== 1) {
      await user.clear(quantity);
      await user.type(quantity, String(total));
    }
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(client.updateWishListItem).toHaveBeenCalledWith(7, 1, expect.objectContaining({
      total_quantity: total,
      selected_printings: expect.arrayContaining([
        expect.objectContaining({ scryfall_id: 'printing-new', quantity: 1 }),
        expect.objectContaining({ scryfall_id: 'second', quantity: 1 }),
        expect.objectContaining({ scryfall_id: 'third', quantity: 1 }),
      ]),
    })));
    expect(screen.getByText(`Quantity requested: ${total}`)).toBeInTheDocument();
  });

  it('adjusts the independently edited total by the change in a printing quantity', async () => {
    const user = userEvent.setup();
    vi.mocked(client.getWishList).mockResolvedValue({ data: [boltItem] });
    vi.mocked(client.getPrintings).mockResolvedValue({ data: [boltItem.printing!] });
    renderWishList();
    await user.click(await screen.findByRole('button', { name: /change printing/i }));
    const total = screen.getByLabelText('Total Quantity');
    const printingQuantity = await screen.findByLabelText(/quantity for masters 25/i);

    await user.clear(printingQuantity);
    expect(total).toHaveValue(1);
    await user.type(printingQuantity, '3');
    expect(total).toHaveValue(3);
    await user.clear(total);
    await user.type(total, '10');
    await user.clear(printingQuantity);
    await user.type(printingQuantity, '2');
    expect(total).toHaveValue(9);

    fireEvent.change(total, { target: { value: '1' } });
    fireEvent.change(printingQuantity, { target: { value: '1' } });
    expect(total).toHaveValue(0);
    expect(total).toBeInvalid();
    fireEvent.change(printingQuantity, { target: { value: '2' } });
    expect(total).toHaveValue(1);
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
    expect(await within(dialog).findByText('Foil only')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/foil for masters 25/i)).not.toBeInTheDocument();
    const foilArtwork = within(dialog).getByRole('img', { name: /^foil set/i }).parentElement!;
    const nonfoilArtwork = within(dialog).getByRole('img', { name: /nonfoil set/i }).parentElement!;
    expect(foilArtwork.querySelector('.foil-shine')).toBeInTheDocument();
    expect(nonfoilArtwork.querySelector('.foil-shine')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('checkbox', { name: /select nonfoil set/i }));
    expect(within(dialog).getByText('Non-foil only')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/foil for nonfoil set/i)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: /select foil set/i }));
    expect(within(dialog).getAllByText('Foil only')).toHaveLength(2);
    expect(within(dialog).queryByLabelText(/foil for foil set/i)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: /select unknown finish set/i }));
    expect(within(dialog).getByLabelText(/foil for unknown finish set/i)).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(client.updateWishListItem).toHaveBeenCalledWith(7, 1, expect.objectContaining({
      selected_printings: [
        { scryfall_id: 'printing-new', quantity: 1, foil_preference: 'foil' },
        { scryfall_id: 'nonfoil-only', quantity: 1, foil_preference: 'nonfoil' },
        { scryfall_id: 'foil-only', quantity: 1, foil_preference: 'foil' },
        { scryfall_id: 'unknown-finish', quantity: 1, foil_preference: 'any' },
      ],
    })));
  });

  it('preserves etched selections when viewing and saving printing preferences', async () => {
    const user = userEvent.setup();
    const mixed = { ...boltItem.printing!, finishes: ['foil', 'etched'] };
    const etchedOnly = { ...boltItem.printing!, scryfall_id: 'etched-only', set_name: 'Etched set', finishes: ['etched'] };
    const item: client.WishListItem = {
      ...boltItem,
      foil: true,
      foil_preference: 'etched',
      selected_printings: [{ scryfall_id: 'printing-new', quantity: 1, foil_preference: 'etched' }],
    };
    vi.mocked(client.getWishList).mockResolvedValue({ data: [item] });
    vi.mocked(client.getPrintings).mockResolvedValue({ data: [mixed, etchedOnly] });
    vi.mocked(client.updateWishListItem).mockResolvedValue({ data: item });
    renderWishList();
    const artwork = await screen.findByRole('img', { name: 'Lightning Bolt' });
    expect(artwork.querySelector('.foil-shine')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /change printing/i }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByLabelText(/foil for masters 25/i)).toHaveValue('etched');
    await user.click(within(dialog).getByRole('checkbox', { name: /select etched set/i }));
    expect(within(dialog).getByText('Etched foil only')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(client.updateWishListItem).toHaveBeenCalledWith(7, 1, expect.objectContaining({
      foil_preference: 'etched',
      selected_printings: [
        { scryfall_id: 'printing-new', quantity: 1, foil_preference: 'etched' },
        { scryfall_id: 'etched-only', quantity: 1, foil_preference: 'etched' },
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
    expect(within(dialog).getByLabelText('Total Quantity')).toHaveValue(3);
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
    expect(within(dialog).getByRole('combobox', { name: 'Foil' })).toHaveValue('any');
    expect(selection).toBeChecked();
    expect(selection).toBeDisabled();
    await user.click(within(dialog).getByRole('switch', { name: 'Any Printing' }));
    expect(selection).toBeEnabled();
    expect(selection).toBeChecked();
    expect(within(dialog).queryByLabelText(/printings under/i)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('switch', { name: 'Any Printing' }));
    await user.type(within(dialog).getByLabelText(/printings under/i), '12.50');
    const quantity = within(dialog).getByLabelText('Total Quantity');
    await user.clear(quantity);
    await user.type(quantity, '4');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(client.updateWishListItem).toHaveBeenCalledWith(7, 1, {
      foil_preference: 'any', any_printing: true, max_price_usd: '12.5', total_quantity: 4,
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
      selected_printings: [{ scryfall_id: 'printing-old', quantity: 1, foil_preference: 'any' }],
    })));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Lightning Bolt' }).querySelector('img')).toHaveAttribute('src', 'https://cards.example/old.jpg');
  });

  it('retains saved Any Printing preferences and changes while toggling', async () => {
    const user = userEvent.setup();
    vi.mocked(client.getWishList).mockResolvedValue({
      data: [{ ...boltItem, any_printing: true, foil_preference: 'etched', any_printing_quantity: 4, total_quantity: 4 }],
    });
    vi.mocked(client.getPrintings).mockResolvedValue({ data: [boltItem.printing!] });
    renderWishList();

    await user.click(await screen.findByRole('button', { name: /change printing/i }));
    expect(screen.getByLabelText('Total Quantity')).toHaveValue(4);
    expect(screen.getByRole('combobox', { name: 'Foil' })).toHaveValue('etched');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Foil' }), 'foil');
    await user.click(screen.getByRole('switch', { name: 'Any Printing' }));
    await user.click(screen.getByRole('switch', { name: 'Any Printing' }));
    expect(screen.getByLabelText('Total Quantity')).toHaveValue(4);
    expect(screen.getByRole('combobox', { name: 'Foil' })).toHaveValue('foil');
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
