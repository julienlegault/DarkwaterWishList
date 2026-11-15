<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WishList extends Model
{
    protected $fillable = ['name', 'notify_me'];

    protected $attributes = ['notify_me' => true];

    protected function casts(): array
    {
        return ['notify_me' => 'boolean'];
    }

    /** @return HasMany<WishListItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(WishListItem::class);
    }
}
