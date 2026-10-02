<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CardPrinting extends Model
{
    protected $primaryKey = 'scryfall_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected $hidden = ['created_at', 'updated_at'];

    protected function casts(): array
    {
        return [
            'image_uris' => 'array',
            'card_faces' => 'array',
            'finishes' => 'array',
            'released_at' => 'date:Y-m-d',
        ];
    }
}
