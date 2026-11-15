<?php

namespace Tests\Feature\Api;

use App\Models\CardPrinting;
use App\Models\User;
use App\Models\WishListItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class WishListsTest extends TestCase
{
    use RefreshDatabase;

    public function test_lists_and_items_require_authentication(): void
    {
        $this->getJson('/api/wish-lists')->assertUnauthorized();
        $this->postJson('/api/wish-lists', [])->assertUnauthorized();
        $this->patchJson('/api/wish-lists/1', [])->assertUnauthorized();
        $this->deleteJson('/api/wish-lists/1', [])->assertUnauthorized();
        $this->getJson('/api/wish-lists/1/items')->assertUnauthorized();
    }

    public function test_lists_are_independent_and_scoped_to_the_owner(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $otherList = $other->wishLists()->create(['name' => 'Private']);
        CardPrinting::query()->create([
            'scryfall_id' => 'printing-1',
            'oracle_id' => 'oracle-1',
            'name' => 'Card',
        ]);
        $this->actingAs($user);
        $first = $this->postJson('/api/wish-lists', ['name' => 'First'])
            ->assertCreated()->assertJsonPath('data.notify_me', true)->json('data.id');
        $second = $this->postJson('/api/wish-lists', ['name' => 'Second'])->assertCreated()->json('data.id');
        $this->getJson('/api/wish-lists')->assertOk()->assertJsonCount(2, 'data');
        $this->postJson("/api/wish-lists/$first/items", ['scryfall_id' => 'printing-1'])->assertCreated();
        $item = $this->postJson("/api/wish-lists/$second/items", ['scryfall_id' => 'printing-1'])->assertCreated()->json('data.id');
        $this->getJson("/api/wish-lists/$first/items")->assertJsonCount(1, 'data');
        $this->getJson("/api/wish-lists/$second/items")->assertJsonCount(1, 'data');
        $this->patchJson("/api/wish-lists/$first/items/$item", ['foil' => true])->assertNotFound();
        $this->deleteJson("/api/wish-lists/$first/items/$item")->assertNotFound();
        $this->patchJson("/api/wish-lists/$second/items/$item", ['foil' => true])->assertOk()->assertJsonPath('data.foil', true);
        $this->getJson("/api/wish-lists/{$otherList->id}/items")->assertNotFound();
        $this->postJson("/api/wish-lists/{$otherList->id}/items", ['scryfall_id' => 'printing-1'])->assertNotFound();
        $this->patchJson("/api/wish-lists/{$otherList->id}", ['notify_me' => true])->assertNotFound();
        $this->deleteJson("/api/wish-lists/{$otherList->id}", ['name' => 'Private'])->assertNotFound();
    }

    public function test_notification_and_confirmation_are_persisted_and_deletion_cascades(): void
    {
        $user = User::factory()->create();
        $list = $user->wishLists()->create(['name' => 'Mý List! #42']);
        $item = WishListItem::factory()->for($user)->create(['wish_list_id' => $list->id]);
        $this->actingAs($user)
            ->patchJson("/api/wish-lists/{$list->id}", ['notify_me' => true])
            ->assertOk()->assertJsonPath('data.notify_me', true);
        $this->getJson('/api/wish-lists')->assertJsonPath('data.0.notify_me', true);
        $this->patchJson("/api/wish-lists/{$list->id}", ['notify_me' => false])
            ->assertOk()->assertJsonPath('data.notify_me', false);
        $this->deleteJson("/api/wish-lists/{$list->id}", ['name' => 'wrong'])->assertUnprocessable();
        $this->assertDatabaseHas('wish_lists', ['id' => $list->id]);
        $this->deleteJson("/api/wish-lists/{$list->id}", ['name' => 'MÝ-list 42'])->assertNoContent();
        $this->assertDatabaseMissing('wish_lists', ['id' => $list->id]);
        $this->assertDatabaseMissing('wish_list_items', ['id' => $item->id]);
    }

    public function test_list_names_must_include_a_letter_or_number(): void
    {
        $this->actingAs(User::factory()->create())
            ->postJson('/api/wish-lists', ['name' => ' !@# '])->assertUnprocessable();
    }

    public function test_notification_default_migration_preserves_existing_preferences(): void
    {
        $migration = require database_path('migrations/2026_11_15_000001_default_wish_list_notifications_on.php');
        $migration->down();
        $user = User::factory()->create();
        $id = DB::table('wish_lists')->insertGetId([
            'user_id' => $user->id,
            'name' => 'Existing',
            'notify_me' => false,
        ]);
        $migration->up();
        $this->assertDatabaseHas('wish_lists', ['id' => $id, 'notify_me' => false]);
        $newId = DB::table('wish_lists')->insertGetId(['user_id' => $user->id, 'name' => 'New']);
        $this->assertDatabaseHas('wish_lists', ['id' => $newId, 'notify_me' => true]);
    }

    public function test_migration_preserves_existing_items(): void
    {
        $migration = require database_path('migrations/2026_11_15_000000_create_wish_lists.php');
        $migration->down();
        $user = User::factory()->create();
        $itemId = DB::table('wish_list_items')->insertGetId([
            'user_id' => $user->id,
            'catalog_id' => 'old-card',
            'scryfall_id' => 'old-printing',
            'card_name' => 'Old Card',
            'foil' => true,
            'in_stock' => false,
        ]);
        $migration->up();
        $list = $user->wishLists()->firstOrFail();
        $this->assertSame('Wish List', $list->name);
        $this->assertTrue($list->notify_me);
        $this->assertDatabaseHas('wish_list_items', [
            'id' => $itemId,
            'wish_list_id' => $list->id,
            'card_name' => 'Old Card',
            'foil' => true,
        ]);
    }
}
