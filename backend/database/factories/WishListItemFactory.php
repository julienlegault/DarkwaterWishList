<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\WishListItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WishListItem>
 */
class WishListItemFactory extends Factory
{
    protected $model = WishListItem::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $scryfallId = fake()->uuid();

        return [
            'user_id' => User::factory(),
            'catalog_id' => fake()->uuid(),
            'scryfall_id' => $scryfallId,
            'card_name' => fake()->words(2, true),
            'foil' => false,
            'tcgplayer_id' => fake()->numberBetween(1000, 999999),
            'in_stock' => false,
        ];
    }
}
