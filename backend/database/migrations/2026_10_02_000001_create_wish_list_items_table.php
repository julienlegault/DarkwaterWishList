<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wish_list_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('catalog_id', 36);
            $table->string('scryfall_id', 36);
            $table->string('card_name');
            $table->boolean('foil')->default(false);
            $table->unsignedBigInteger('tcgplayer_id')->nullable()->index();
            $table->boolean('in_stock')->default(false);
            $table->timestamps();

            $table->unique(['user_id', 'catalog_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wish_list_items');
    }
};
