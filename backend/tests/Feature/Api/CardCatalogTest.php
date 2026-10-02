<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CardCatalogTest extends TestCase
{
    use RefreshDatabase;

    public function test_catalog_endpoints_require_authentication(): void
    {
        $this->getJson('/api/cards/search?q=lightning')->assertUnauthorized();
        $this->getJson('/api/cards/oracle-id/printings')->assertUnauthorized();
    }

    public function test_import_replaces_printings_without_duplicates_and_handles_optional_data(): void
    {
        $user = User::factory()->create();
        $printing = $this->printing(
            'printing-one',
            'oracle-one',
            'Lightning Bolt',
            '2024-01-01',
            12345,
            ['normal' => 'https://cards.example/lightning.jpg'],
            ['nonfoil', 'foil'],
        );
        $digitalOnlyPrinting = $this->printing(
            'digital-only',
            'digital-oracle',
            'Digital Card',
            '2024-02-01',
            games: ['mtgo'],
        );
        $this->import([$printing, $digitalOnlyPrinting]);

        $this->assertDatabaseCount('card_printings', 1);
        $this->assertDatabaseHas('card_printings', [
            'scryfall_id' => 'printing-one',
            'tcgplayer_id' => 12345,
        ]);

        $updated = $this->printing('printing-one', 'oracle-one', 'Lightning Bolt', '2024-01-01', 98765, null, null);
        $this->import([$updated]);

        $this->assertDatabaseCount('card_printings', 1);
        $this->assertDatabaseHas('card_printings', [
            'scryfall_id' => 'printing-one',
            'tcgplayer_id' => 98765,
            'image_uris' => null,
            'finishes' => null,
        ]);

        $this->actingAs($user)
            ->getJson('/api/cards/oracle-one/printings')
            ->assertOk()
            ->assertJsonPath('data.0.image_uris', null)
            ->assertJsonPath('data.0.finishes', null);
    }

    public function test_search_returns_one_suggestion_per_card_identity(): void
    {
        $user = User::factory()->create();
        $this->import([
            $this->printing('bolt-old', 'oracle-bolt', 'Lightning Bolt', '1993-08-05'),
            $this->printing('bolt-new', 'oracle-bolt', 'Lightning Bolt', '2024-01-01'),
            $this->printing('bolt-alt', 'oracle-other-bolt', 'Lightning Bolt Alternate', '2025-01-01'),
            $this->printing('no-oracle-id', null, 'Lightning identity-less', '2025-01-01'),
        ]);

        $this->actingAs($user)
            ->getJson('/api/cards/search?q=Lightning')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonFragment([
                'catalog_id' => 'oracle-bolt',
                'oracle_id' => 'oracle-bolt',
                'name' => 'Lightning Bolt',
            ])
            ->assertJsonFragment([
                'catalog_id' => 'no-oracle-id',
                'oracle_id' => null,
                'name' => 'Lightning identity-less',
            ]);
    }

    public function test_failed_refresh_keeps_the_existing_catalog(): void
    {
        $this->import([
            $this->printing('preserved-card', 'preserved-oracle', 'Preserved Card', '2024-01-01'),
        ]);

        $path = tempnam(sys_get_temp_dir(), 'scryfall-invalid-');
        file_put_contents($path, '[{"id":"partial-card","name":"Partial Card"}');

        try {
            $this->artisan('scryfall:refresh', ['--file' => $path])->assertExitCode(1);
        } finally {
            unlink($path);
        }

        $this->assertDatabaseCount('card_printings', 1);
        $this->assertDatabaseHas('card_printings', ['scryfall_id' => 'preserved-card']);
    }

    public function test_printings_returns_all_printings_most_recent_first(): void
    {
        $user = User::factory()->create();
        $latest = $this->printing('card-new', 'card-oracle', 'Example Card', '2025-01-01', 54321, null, ['foil']);
        $latest['card_faces'] = [
            ['name' => 'Front Face', 'image_uris' => ['normal' => 'https://cards.example/front.jpg']],
            ['name' => 'Back Face', 'image_uris' => ['normal' => 'https://cards.example/back.jpg']],
        ];

        $this->import([
            $this->printing('card-old', 'card-oracle', 'Example Card', '2000-01-01'),
            $latest,
        ]);

        $this->actingAs($user)
            ->getJson('/api/cards/card-oracle/printings')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.scryfall_id', 'card-new')
            ->assertJsonPath('data.0.tcgplayer_id', 54321)
            ->assertJsonPath('data.0.finishes', ['foil'])
            ->assertJsonPath('data.0.card_faces.0.image_uris.normal', 'https://cards.example/front.jpg')
            ->assertJsonPath('data.1.scryfall_id', 'card-old')
            ->assertJsonPath('data.1.tcgplayer_id', null);
    }

    private function import(array $cards): void
    {
        $path = tempnam(sys_get_temp_dir(), 'scryfall-test-');
        file_put_contents($path, json_encode($cards, JSON_THROW_ON_ERROR));

        try {
            $this->artisan('scryfall:refresh', ['--file' => $path])->assertExitCode(0);
        } finally {
            unlink($path);
        }
    }

    private function printing(
        string $id,
        ?string $oracleId,
        string $name,
        string $releasedAt,
        ?int $tcgplayerId = null,
        ?array $imageUris = null,
        ?array $finishes = null,
        array $games = ['paper'],
    ): array {
        return array_filter([
            'id' => $id,
            'oracle_id' => $oracleId,
            'name' => $name,
            'released_at' => $releasedAt,
            'tcgplayer_id' => $tcgplayerId,
            'image_uris' => $imageUris,
            'finishes' => $finishes,
            'games' => $games,
        ], static fn (mixed $value): bool => $value !== null);
    }
}
