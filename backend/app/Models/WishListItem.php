<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WishListItem extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

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
        ];
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
