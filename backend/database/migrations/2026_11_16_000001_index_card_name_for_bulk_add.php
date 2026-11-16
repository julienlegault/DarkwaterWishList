<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            DB::statement('CREATE INDEX card_printings_lower_name_index ON card_printings (LOWER(name))');
        }
        Schema::table('wish_list_items', function (Blueprint $table) {
            $table->index(['wish_list_id', 'card_name', 'id'], 'wish_list_items_page_index');
        });
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            DB::statement('DROP INDEX card_printings_lower_name_index');
        }
        Schema::table('wish_list_items', function (Blueprint $table) {
            $table->dropIndex('wish_list_items_page_index');
        });
    }
};
