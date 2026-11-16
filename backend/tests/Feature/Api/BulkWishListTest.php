<?php

namespace Tests\Feature\Api;

use App\Models\CardPrinting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BulkWishListTest extends TestCase
{
    use RefreshDatabase;

    public function test_bulk_add_requires_an_owned_list(): void
    {
        $list = User::factory()->create()->wishLists()->create(['name' => 'Private']);
        $url = "/api/wish-lists/{$list->id}/bulk-items";
        $this->postJson($url, ['line' => 'Card'])->assertUnauthorized();
        $this->actingAs(User::factory()->create())->postJson($url, ['line' => 'Card'])->assertNotFound();
    }

    public function test_bulk_add_resolves_printings_and_merges_quantities(): void
    {
        $user = User::factory()->create();
        $list = $user->wishLists()->create(['name' => 'Cards']);
        $url = "/api/wish-lists/{$list->id}/bulk-items";
        CardPrinting::query()->create([
            'scryfall_id' => 'apex', 'oracle_id' => 'oracle-apex', 'name' => 'Apex Devastator',
            'set_code' => 'm3c', 'collector_number' => '220', 'finishes' => ['nonfoil', 'foil'],
        ]);
        CardPrinting::query()->create([
            'scryfall_id' => 'ring', 'oracle_id' => 'oracle-ring', 'name' => 'Barbarian Ring',
            'set_code' => 'ody', 'collector_number' => '313', 'finishes' => ['foil', 'nonfoil'],
        ]);
        CardPrinting::query()->create([
            'scryfall_id' => 'ring-alt', 'oracle_id' => 'oracle-ring', 'name' => 'Barbarian Ring',
            'set_code' => 'other', 'collector_number' => '5a', 'finishes' => ['nonfoil'],
        ]);
        CardPrinting::query()->create([
            'scryfall_id' => 'bazaar', 'oracle_id' => 'oracle-bazaar', 'name' => 'Bazaar Trader',
            'set_code' => 'wwk', 'collector_number' => '72', 'finishes' => ['foil'],
        ]);
        $this->actingAs($user);
        $this->postJson($url, ['line' => '1 Apex Devastator (M3C) 220'])->assertCreated()
            ->assertJsonPath('data.total_quantity', 1)->assertJsonPath('data.selected_printings.0.foil_preference', 'nonfoil');
        $this->postJson($url, ['line' => '2 Barbarian Ring (ODY) 313 *F*'])->assertCreated()
            ->assertJsonPath('data.total_quantity', 2)->assertJsonPath('data.selected_printings.0.foil_preference', 'foil');
        $this->postJson($url, ['line' => '1 Bazaar Trader (WWK) 72 *F*'])->assertCreated()
            ->assertJsonPath('data.scryfall_id', 'bazaar');
        $this->postJson($url, ['line' => '3 barbarian ring (other) 5A'])->assertCreated()
            ->assertJsonPath('data.total_quantity', 5)
            ->assertJsonPath('data.selected_printings.1.quantity', 3)
            ->assertJsonCount(2, 'data.preview_printings');
        $this->postJson($url, ['line' => '1 Barbarian Ring (ODY) 313 *f*'])->assertCreated()
            ->assertJsonPath('data.total_quantity', 6)->assertJsonPath('data.selected_printings.0.quantity', 3);
        $this->postJson($url, ['line' => 'Apex Devastator'])->assertCreated()->assertJsonPath('data.total_quantity', 2);
        $this->assertDatabaseCount('wish_list_items', 3);
    }

    public function test_invalid_lines_and_conflicts_do_not_change_the_wishlist(): void
    {
        $user = User::factory()->create();
        $list = $user->wishLists()->create(['name' => 'Cards']);
        $url = "/api/wish-lists/{$list->id}/bulk-items";
        CardPrinting::query()->create([
            'scryfall_id' => 'card', 'oracle_id' => 'oracle', 'name' => 'Card',
            'set_code' => 'set', 'collector_number' => '1', 'finishes' => ['foil', 'nonfoil'],
        ]);
        $this->actingAs($user);
        foreach (['Missing', 'Card (SET) 2', '0 Card', '4294967296 Card', 'Card (SET)', 'Card *X*'] as $line) {
            $this->postJson($url, ['line' => $line])->assertUnprocessable();
        }
        $this->postJson($url, ['line' => 'Card'])->assertCreated();
        $this->postJson($url, ['line' => 'Card *F*'])->assertUnprocessable()
            ->assertJsonValidationErrors('line');
        $this->getJson("/api/wish-lists/{$list->id}/items")->assertJsonPath('data.0.total_quantity', 1);
        $item = $list->items()->firstOrFail();
        $item->update(['any_printing' => true]);
        $this->postJson($url, ['line' => 'Card'])->assertUnprocessable();
        $this->assertSame(1, $item->refresh()->total_quantity);
    }

    public function test_unavailable_finish_and_combined_quantity_overflow_are_rejected(): void
    {
        $user = User::factory()->create();
        $list = $user->wishLists()->create(['name' => 'Cards']);
        $url = "/api/wish-lists/{$list->id}/bulk-items";
        CardPrinting::query()->create([
            'scryfall_id' => 'card', 'oracle_id' => 'oracle', 'name' => 'Card',
            'set_code' => 'set', 'collector_number' => '1', 'finishes' => ['nonfoil'],
        ]);
        $this->actingAs($user);
        $this->postJson($url, ['line' => 'Card (SET) 1 *F*'])->assertUnprocessable();
        $this->postJson($url, ['line' => '4294967295 Card'])->assertCreated();
        $this->postJson($url, ['line' => 'Card'])->assertUnprocessable()
            ->assertJsonValidationErrors('line');
        $this->getJson("/api/wish-lists/{$list->id}/items")
            ->assertJsonPath('data.0.total_quantity', 4294967295)
            ->assertJsonPath('data.0.selected_printings.0.quantity', 4294967295);
    }
}
