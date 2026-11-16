<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('card_printings', function (Blueprint $table) {
            $table->string('front_name')->nullable();
            $table->string('flavor_name')->nullable();
        });

        DB::table('card_printings')->where('name', 'like', '% // %')
            ->select('scryfall_id', 'name')->orderBy('scryfall_id')
            ->chunkById(500, function ($printings) {
                foreach ($printings as $printing) {
                    DB::table('card_printings')->where('scryfall_id', $printing->scryfall_id)
                        ->update(['front_name' => explode(' // ', $printing->name, 2)[0]]);
                }
            }, 'scryfall_id');

        if (DB::getDriverName() === 'sqlite') {
            DB::statement('CREATE INDEX card_printings_lower_front_name_index ON card_printings (LOWER(front_name))');
            DB::statement('CREATE INDEX card_printings_lower_flavor_name_index ON card_printings (LOWER(flavor_name))');
        } else {
            Schema::table('card_printings', function (Blueprint $table) {
                $table->index('front_name');
                $table->index('flavor_name');
            });
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            DB::statement('DROP INDEX card_printings_lower_front_name_index');
            DB::statement('DROP INDEX card_printings_lower_flavor_name_index');
        } else {
            Schema::table('card_printings', function (Blueprint $table) {
                $table->dropIndex(['front_name']);
                $table->dropIndex(['flavor_name']);
            });
        }

        Schema::table('card_printings', function (Blueprint $table) {
            $table->dropColumn(['front_name', 'flavor_name']);
        });
    }
};
