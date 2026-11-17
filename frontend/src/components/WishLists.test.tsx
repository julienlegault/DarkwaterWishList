import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import WishLists from './WishLists';

vi.mock('../api/client', async (importOriginal) => ({
  ...await importOriginal<typeof client>(),
  getWishLists: vi.fn(),
  createWishList: vi.fn(),
  updateWishList: vi.fn(),
  deleteWishList: vi.fn(),
  getWishList: vi.fn(),
  getWishListTotalCards: vi.fn(),
}));

describe('WishLists', () => {
  beforeEach(() => vi.mocked(client.getWishListTotalCards).mockResolvedValue({ total_cards: 0 }));
  afterEach(() => vi.resetAllMocks());

  it('creates lists, switches between them, and persists the notification preference', async () => {
    const user = userEvent.setup();
    vi.mocked(client.getWishLists).mockResolvedValue({ data: [{ id: 1, name: 'First', notify_me: false }] });
    vi.mocked(client.getWishList).mockResolvedValue({ data: [] });
    vi.mocked(client.createWishList).mockResolvedValue({ data: { id: 2, name: 'Second', notify_me: true } });
    vi.mocked(client.updateWishList).mockResolvedValue({ data: { id: 2, name: 'Second', notify_me: false } });
    render(<WishLists />);

    await screen.findByRole('heading', { name: 'First' });
    await user.click(screen.getByRole('button', { name: 'Add list' }));
    const dialog = screen.getByRole('dialog', { name: 'Add List' });
    await user.type(within(dialog).getByLabelText('List name'), 'Second');
    await user.click(within(dialog).getByRole('button', { name: 'Add List' }));
    await screen.findByRole('heading', { name: 'Second' });
    expect(client.createWishList).toHaveBeenCalledWith('Second');
    expect(client.getWishList).toHaveBeenCalledWith(2);
    expect(screen.getByRole('switch', { name: 'Notify Me' })).toBeChecked();
    await user.click(screen.getByRole('switch', { name: 'Notify Me' }));
    await waitFor(() => expect(client.updateWishList).toHaveBeenCalledWith(2, false));
    expect(screen.getByRole('switch', { name: 'Notify Me' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'First' }));
    await screen.findByRole('heading', { name: 'First' });
    expect(client.getWishList).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: 'Bulk Add' })).toBeInTheDocument();
  });

  it('requires a confirmed name to delete and shows failures', async () => {
    const user = userEvent.setup();
    vi.mocked(client.getWishLists).mockResolvedValue({ data: [{ id: 1, name: 'My List!', notify_me: false }] });
    vi.mocked(client.getWishList).mockResolvedValue({ data: [] });
    vi.mocked(client.deleteWishList)
      .mockRejectedValueOnce(new client.ApiError('Invalid', 422))
      .mockResolvedValueOnce(undefined);
    render(<WishLists />);
    await screen.findByRole('heading', { name: 'My List!' });
    await user.click(screen.getByRole('button', { name: 'Delete List' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete List' });
    const input = within(dialog).getByLabelText('Confirm list name');
    await user.type(input, 'wrong');
    await user.click(within(dialog).getByRole('button', { name: 'Delete List' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('does not match');
    await user.clear(input);
    await user.type(input, 'my-list');
    await user.click(within(dialog).getByRole('button', { name: 'Delete List' }));
    await waitFor(() => expect(client.deleteWishList).toHaveBeenLastCalledWith(1, 'my-list'));
    expect(await screen.findByText(/select a list or add one/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the previous notification setting when saving fails', async () => {
    const user = userEvent.setup();
    vi.mocked(client.getWishLists).mockResolvedValue({ data: [{ id: 1, name: 'First', notify_me: false }] });
    vi.mocked(client.getWishList).mockResolvedValue({ data: [] });
    vi.mocked(client.updateWishList).mockRejectedValue(new Error('Network error'));
    render(<WishLists />);
    const toggle = await screen.findByRole('switch', { name: 'Notify Me' });
    await user.click(toggle);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to update notification settings');
    expect(toggle).not.toBeChecked();
  });

  it('creates a default "My Wishlist" when user has no lists', async () => {
    vi.mocked(client.getWishLists).mockResolvedValue({ data: [] });
    vi.mocked(client.createWishList).mockResolvedValue({ data: { id: 1, name: 'My Wishlist', notify_me: true } });
    vi.mocked(client.getWishList).mockResolvedValue({ data: [] });
    render(<WishLists />);
    await screen.findByRole('heading', { name: 'My Wishlist' });
    expect(client.createWishList).toHaveBeenCalledWith('My Wishlist');
    expect(screen.getByRole('button', { name: 'My Wishlist' })).toHaveAttribute('aria-current', 'true');
  });

  it('shows an error when creating the default list fails', async () => {
    vi.mocked(client.getWishLists).mockResolvedValue({ data: [] });
    vi.mocked(client.createWishList).mockRejectedValue(new Error('Network error'));
    render(<WishLists />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to create default list');
  });
});
