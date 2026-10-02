<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('card_printings', function (Blueprint $table) {
            $table->string('scryfall_id', 36)->primary();
            $table->string('oracle_id', 36)->nullable()->index();
            $table->string('name')->index();
            $table->string('set_code', 10)->nullable();
            $table->string('set_name')->nullable();
            $table->string('collector_number')->nullable();
            $table->date('released_at')->nullable();
            $table->string('lang', 10)->nullable();
            $table->unsignedBigInteger('tcgplayer_id')->nullable()->index();
            $table->json('image_uris')->nullable();
            $table->json('card_faces')->nullable();
            $table->json('finishes')->nullable();
            $table->timestamps();

            $table->index(['oracle_id', 'released_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('card_printings');
    }
};
