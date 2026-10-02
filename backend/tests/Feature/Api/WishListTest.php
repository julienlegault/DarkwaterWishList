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
            ->assertJsonPath('data.in_stock', false);

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
        $this->actingAs($user)
            ->postJson('/api/wishlist', ['scryfall_id' => $newest->scryfall_id, 'foil' => true])
            ->assertCreated()
            ->assertJsonPath('data.scryfall_id', 'printing-new')
            ->assertJsonPath('data.foil', true);

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
