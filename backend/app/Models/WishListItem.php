<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WishListItem extends Model
{
    use HasFactory;

    public const CONDITIONS = ['near_mint', 'light_play', 'moderate_play', 'heavy_play', 'damaged'];

    protected $guarded = ['id'];

    protected $attributes = [
        'conditions' => '["near_mint","light_play","moderate_play","heavy_play","damaged"]',
    ];

    protected function casts(): array
    {
        return [
            'foil' => 'boolean',
            'in_stock' => 'boolean',
            'any_printing' => 'boolean',
            'max_price_usd' => 'decimal:2',
            'any_printing_quantity' => 'integer',
            'total_quantity' => 'integer',
            'selected_printings' => 'array',
            'conditions' => 'array',
        ];
    }

    public function matchesCondition(string $scryfallId, string $condition): bool
    {
        if (! in_array($condition, self::CONDITIONS, true)) {
            return false;
        }
        if ($this->any_printing) {
            return in_array($condition, $this->conditions ?? self::CONDITIONS, true);
        }
        $selections = $this->selected_printings ?? [['scryfall_id' => $this->scryfall_id]];
        foreach ($selections as $selection) {
            if ($selection['scryfall_id'] === $scryfallId) {
                return in_array($condition, $selection['conditions'] ?? self::CONDITIONS, true);
            }
        }

        return false;
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * The currently selected printing, used to display card artwork.
     *
     * @return BelongsTo<CardPrinting, $this>
     */
    public function printing(): BelongsTo
    {
        return $this->belongsTo(CardPrinting::class, 'scryfall_id', 'scryfall_id');
    }
}
