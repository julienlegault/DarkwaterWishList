<?php

namespace Tests\Feature\Api;

use App\Models\CardPrinting;
use App\Models\User;
use App\Models\WishListItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WishListTest extends TestCase
{
    use RefreshDatabase;

    public function test_wishlist_endpoints_require_authentication(): void
    {
        $this->getJson('/api/wishlist')->assertUnauthorized();
        $this->postJson('/api/wishlist', [])->assertUnauthorized();
        $this->patchJson('/api/wishlist/1', [])->assertUnauthorized();
        $this->deleteJson('/api/wishlist/1')->assertUnauthorized();
    }

    public function test_index_only_returns_the_authenticated_users_items(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();

        WishListItem::factory()->for($user)->create(['card_name' => 'My Card']);
        WishListItem::factory()->for($otherUser)->create(['card_name' => 'Their Card']);

        $this->actingAs($user)
            ->getJson('/api/wishlist')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.card_name', 'My Card');
    }

    public function test_store_adds_a_card_using_the_given_printing(): void
    {
        $user = User::factory()->create();
        $printing = $this->createPrinting('printing-new', 'oracle-bolt', 'Lightning Bolt', 12345);

        $response = $this->actingAs($user)
            ->postJson('/api/wishlist', ['scryfall_id' => $printing->scryfall_id])
            ->assertCreated()
            ->assertJsonPath('data.card_name', 'Lightning Bolt')
            ->assertJsonPath('data.scryfall_id', 'printing-new')
            ->assertJsonPath('data.tcgplayer_id', 12345)
            ->assertJsonPath('data.foil', false)
            ->assertJsonPath('data.in_stock', false)
            ->assertJsonPath('data.any_printing', false)
            ->assertJsonPath('data.any_printing_quantity', 1);

        $this->assertDatabaseHas('wish_list_items', [
            'user_id' => $user->id,
            'catalog_id' => 'oracle-bolt',
            'scryfall_id' => 'printing-new',
        ]);
        $response->assertStatus(201);
    }

    public function test_store_allows_printings_without_a_tcgplayer_id(): void
    {
        $user = User::factory()->create();
        $printing = $this->createPrinting('printing-no-tcg', 'oracle-no-tcg', 'No TCG Card', null);

        $this->actingAs($user)
            ->postJson('/api/wishlist', ['scryfall_id' => $printing->scryfall_id])
            ->assertCreated()
            ->assertJsonPath('data.tcgplayer_id', null);

        $this->assertDatabaseHas('wish_list_items', [
            'user_id' => $user->id,
            'scryfall_id' => 'printing-no-tcg',
            'tcgplayer_id' => null,
        ]);
    }

    public function test_store_updates_the_existing_item_instead_of_duplicating_the_card(): void
    {
        $user = User::factory()->create();
        $this->createPrinting('printing-old', 'oracle-bolt', 'Lightning Bolt', 111, '2000-01-01');
        $newest = $this->createPrinting('printing-new', 'oracle-bolt', 'Lightning Bolt', 222, '2025-01-01');

        $this->actingAs($user)->postJson('/api/wishlist', ['scryfall_id' => 'printing-old'])->assertCreated();
        WishListItem::query()->where('catalog_id', 'oracle-bolt')->update(['any_printing_quantity' => 4]);
        $this->actingAs($user)
            ->postJson('/api/wishlist', ['scryfall_id' => $newest->scryfall_id, 'foil' => true])
            ->assertCreated()
            ->assertJsonPath('data.scryfall_id', 'printing-new')
            ->assertJsonPath('data.foil', true)
            ->assertJsonPath('data.any_printing_quantity', 4);

        $this->assertDatabaseCount('wish_list_items', 1);
    }

    public function test_store_requires_a_known_printing(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/wishlist', ['scryfall_id' => 'unknown-printing'])
            ->assertUnprocessable();
    }

    public function test_update_changes_foil_selection(): void
    {
        $user = User::factory()->create();
        $printing = $this->createPrinting('printing-foil', 'oracle-foil', 'Foil Card', 999);
        $item = WishListItem::factory()->for($user)->create([
            'catalog_id' => 'oracle-foil',
            'scryfall_id' => $printing->scryfall_id,
            'card_name' => $printing->name,
            'foil' => false,
            'tcgplayer_id' => 999,
        ]);

        $this->actingAs($user)
            ->patchJson("/api/wishlist/{$item->id}", ['foil' => true])
            ->assertOk()
            ->assertJsonPath('data.foil', true);

        $this->assertDatabaseHas('wish_list_items', ['id' => $item->id, 'foil' => true]);
    }

    public function test_update_changes_the_selected_printing(): void
    {
        $user = User::factory()->create();
        $original = $this->createPrinting('printing-a', 'oracle-print', 'Printable Card', 1, '2000-01-01');
        $alternate = $this->createPrinting('printing-b', 'oracle-print', 'Printable Card', 2, '2024-01-01');
        $item = WishListItem::factory()->for($user)->create([
            'catalog_id' => 'oracle-print',
            'scryfall_id' => $original->scryfall_id,
            'card_name' => $original->name,
            'tcgplayer_id' => $original->tcgplayer_id,
            'in_stock' => true,
        ]);

        $this->actingAs($user)
            ->patchJson("/api/wishlist/{$item->id}", ['scryfall_id' => $alternate->scryfall_id])
            ->assertOk()
            ->assertJsonPath('data.scryfall_id', 'printing-b')
            ->assertJsonPath('data.tcgplayer_id', 2)
            ->assertJsonPath('data.in_stock', false);
    }

    public function test_update_rejects_a_printing_of_a_different_card(): void
    {
        $user = User::factory()->create();
        $this->createPrinting('printing-x', 'oracle-x', 'Card X', 1);
        $unrelated = $this->createPrinting('printing-y', 'oracle-y', 'Card Y', 2);
        $item = WishListItem::factory()->for($user)->create([
            'catalog_id' => 'oracle-x',
            'scryfall_id' => 'printing-x',
        ]);

        $this->actingAs($user)
            ->patchJson("/api/wishlist/{$item->id}", ['scryfall_id' => $unrelated->scryfall_id])
            ->assertUnprocessable();

        $this->assertDatabaseHas('wish_list_items', ['id' => $item->id, 'scryfall_id' => 'printing-x']);
    }

    public function test_item_preferences_are_saved_and_preserved_when_any_printing_is_toggled(): void
    {
        $user = User::factory()->create();
        $this->createPrinting('printing-a', 'oracle-print', 'Printable Card', 1);
        $this->createPrinting('printing-b', 'oracle-print', 'Printable Card', 2);
        $item = WishListItem::factory()->for($user)->create([
            'catalog_id' => 'oracle-print',
            'scryfall_id' => 'printing-a',
        ]);
        $selections = [
            ['scryfall_id' => 'printing-a', 'quantity' => 2, 'foil_preference' => 'foil'],
            ['scryfall_id' => 'printing-b', 'quantity' => 3, 'foil_preference' => 'nonfoil'],
        ];

        $this->actingAs($user)->patchJson("/api/wishlist/{$item->id}", [
            'foil_preference' => 'either',
            'any_printing' => true,
            'max_price_usd' => '12.50',
            'any_printing_quantity' => 4,
            'selected_printings' => $selections,
        ])->assertOk()
            ->assertJsonPath('data.foil_preference', 'either')
            ->assertJsonPath('data.any_printing', true)
            ->assertJsonPath('data.max_price_usd', '12.50')
            ->assertJsonPath('data.any_printing_quantity', 4)
            ->assertJsonPath('data.selected_printings', $selections);

        $this->actingAs($user)->patchJson("/api/wishlist/{$item->id}", ['any_printing' => false])
            ->assertOk()->assertJsonPath('data.selected_printings', $selections);
        $this->actingAs($user)->getJson('/api/wishlist')
            ->assertOk()->assertJsonPath('data.0.selected_printings', $selections);
    }

    public function test_item_preferences_reject_invalid_printings_quantities_and_prices(): void
    {
        $user = User::factory()->create();
        $this->createPrinting('printing-a', 'oracle-a', 'Card A', 1);
        $this->createPrinting('printing-b', 'oracle-b', 'Card B', 2);
        $item = WishListItem::factory()->for($user)->create([
            'catalog_id' => 'oracle-a', 'scryfall_id' => 'printing-a',
        ]);

        $this->actingAs($user)->patchJson("/api/wishlist/{$item->id}", [
            'selected_printings' => [['scryfall_id' => 'printing-b', 'quantity' => 1]],
        ])->assertUnprocessable()->assertJsonValidationErrors('selected_printings');
        $this->actingAs($user)->patchJson("/api/wishlist/{$item->id}", [
            'selected_printings' => [['scryfall_id' => 'printing-a', 'quantity' => 0]],
            'any_printing_quantity' => 0,
            'max_price_usd' => '1.234',
        ])->assertUnprocessable()->assertJsonValidationErrors([
            'selected_printings.0.quantity', 'any_printing_quantity', 'max_price_usd',
        ]);
        $this->actingAs($user)->patchJson("/api/wishlist/{$item->id}", [
            'selected_printings' => [['scryfall_id' => 'printing-a', 'quantity' => 1, 'foil_preference' => 'invalid']],
        ])->assertUnprocessable()->assertJsonValidationErrors('selected_printings.0.foil_preference');
    }

    public function test_legacy_updates_preserve_or_update_printing_foil_preferences(): void
    {
        $user = User::factory()->create();
        $this->createPrinting('printing-a', 'oracle-a', 'Card A', 1);
        $item = WishListItem::factory()->for($user)->create([
            'catalog_id' => 'oracle-a',
            'scryfall_id' => 'printing-a',
            'selected_printings' => [['scryfall_id' => 'printing-a', 'quantity' => 1, 'foil_preference' => 'either']],
        ]);
        $this->actingAs($user)->patchJson("/api/wishlist/{$item->id}", [
            'selected_printings' => [['scryfall_id' => 'printing-a', 'quantity' => 2]],
        ])->assertOk()->assertJsonPath('data.selected_printings.0.foil_preference', 'either');
        $this->actingAs($user)->patchJson("/api/wishlist/{$item->id}", ['foil_preference' => 'nonfoil'])
            ->assertOk()->assertJsonPath('data.selected_printings.0.foil_preference', 'either');
        $this->actingAs($user)->patchJson("/api/wishlist/{$item->id}", ['foil' => true])
            ->assertOk()->assertJsonPath('data.selected_printings.0.foil_preference', 'foil');
    }

    public function test_preferences_migration_preserves_existing_foil_and_printing(): void
    {
        $user = User::factory()->create();
        $item = WishListItem::factory()->for($user)->create([
            'scryfall_id' => 'existing-printing', 'foil' => true,
        ]);
        $migration = require database_path('migrations/2026_11_15_000002_add_wish_list_item_preferences.php');
        $migration->down();
        $migration->up();

        $item->refresh();
        $this->assertSame('foil', $item->foil_preference);
        $this->assertFalse($item->any_printing);
        $this->assertSame([['scryfall_id' => 'existing-printing', 'quantity' => 1]], $item->selected_printings);
    }

    public function test_printing_foil_migration_preserves_previous_global_preference(): void
    {
        $user = User::factory()->create();
        $item = WishListItem::factory()->for($user)->create([
            'foil_preference' => 'either',
            'selected_printings' => [['scryfall_id' => 'existing-printing', 'quantity' => 2]],
        ]);
        $migration = require database_path('migrations/2026_11_15_000003_add_printing_foil_preferences.php');
        $migration->up();
        $item->refresh();
        $this->assertSame([
            ['scryfall_id' => 'existing-printing', 'quantity' => 2, 'foil_preference' => 'either'],
        ], $item->selected_printings);
    }

    public function test_preview_printings_follow_selection_or_most_recent_any_printings(): void
    {
        $user = User::factory()->create();
        $selections = [];
        for ($i = 1; $i <= 6; $i++) {
            $this->createPrinting("printing-$i", 'oracle-preview', 'Card', $i, "2024-01-0$i");
            $selections[] = ['scryfall_id' => "printing-$i", 'quantity' => 1, 'foil_preference' => 'nonfoil'];
        }
        $item = WishListItem::factory()->for($user)->create([
            'catalog_id' => 'oracle-preview',
            'scryfall_id' => 'printing-1',
            'selected_printings' => $selections,
        ]);
        $this->actingAs($user)->getJson('/api/wishlist')
            ->assertOk()->assertJsonCount(5, 'data.0.preview_printings')
            ->assertJsonPath('data.0.preview_printings.0.scryfall_id', 'printing-1')
            ->assertJsonPath('data.0.preview_printings.4.scryfall_id', 'printing-5');
        $this->actingAs($user)->patchJson("/api/wishlist/{$item->id}", ['any_printing' => true])
            ->assertOk()->assertJsonCount(5, 'data.preview_printings')
            ->assertJsonPath('data.preview_printings.0.scryfall_id', 'printing-6')
            ->assertJsonPath('data.preview_printings.4.scryfall_id', 'printing-2');
    }

    public function test_destroy_removes_the_item(): void
    {
        $user = User::factory()->create();
        $item = WishListItem::factory()->for($user)->create();

        $this->actingAs($user)
            ->deleteJson("/api/wishlist/{$item->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('wish_list_items', ['id' => $item->id]);
    }

    public function test_users_cannot_view_update_or_delete_another_users_items(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $item = WishListItem::factory()->for($owner)->create();

        $this->actingAs($intruder)
            ->patchJson("/api/wishlist/{$item->id}", ['foil' => true])
            ->assertNotFound();

        $this->actingAs($intruder)
            ->deleteJson("/api/wishlist/{$item->id}")
            ->assertNotFound();

        $this->assertDatabaseHas('wish_list_items', ['id' => $item->id, 'foil' => false]);
    }

    public function test_index_includes_the_selected_printings_artwork(): void
    {
        $user = User::factory()->create();
        $printing = $this->createPrinting('printing-art', 'oracle-art', 'Artful Card', 42);
        $printing->image_uris = ['normal' => 'https://cards.example/art.jpg'];
        $printing->save();
        WishListItem::factory()->for($user)->create([
            'catalog_id' => 'oracle-art',
            'scryfall_id' => 'printing-art',
            'card_name' => 'Artful Card',
        ]);

        $this->actingAs($user)
            ->getJson('/api/wishlist')
            ->assertOk()
            ->assertJsonPath('data.0.printing.image_uris.normal', 'https://cards.example/art.jpg');
    }

    private function createPrinting(
        string $scryfallId,
        string $oracleId,
        string $name,
        ?int $tcgplayerId,
        string $releasedAt = '2024-01-01',
    ): CardPrinting {
        return CardPrinting::query()->create([
            'scryfall_id' => $scryfallId,
            'oracle_id' => $oracleId,
            'name' => $name,
            'released_at' => $releasedAt,
            'tcgplayer_id' => $tcgplayerId,
        ]);
    }
}
