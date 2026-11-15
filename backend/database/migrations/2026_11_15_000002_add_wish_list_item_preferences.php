<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wish_list_items', function (Blueprint $table) {
            $table->string('foil_preference')->default('nonfoil');
            $table->boolean('any_printing')->default(false);
            $table->decimal('max_price_usd', 10, 2)->nullable();
            $table->unsignedInteger('any_printing_quantity')->default(1);
            $table->json('selected_printings')->nullable();
        });

        DB::table('wish_list_items')->orderBy('id')->chunkById(500, function ($items) {
            foreach ($items as $item) {
                DB::table('wish_list_items')->where('id', $item->id)->update([
                    'foil_preference' => $item->foil ? 'foil' : 'nonfoil',
                    'selected_printings' => json_encode([['scryfall_id' => $item->scryfall_id, 'quantity' => 1]], JSON_THROW_ON_ERROR),
                ]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('wish_list_items', function (Blueprint $table) {
            $table->dropColumn(['foil_preference', 'any_printing', 'max_price_usd', 'any_printing_quantity', 'selected_printings']);
        });
    }
};
