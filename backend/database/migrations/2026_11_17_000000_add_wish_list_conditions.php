<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $conditions = ['near_mint', 'light_play', 'moderate_play', 'heavy_play', 'damaged'];
        Schema::table('wish_list_items', function (Blueprint $table) {
            $table->json('conditions')->nullable();
        });

        DB::table('wish_list_items')->orderBy('id')->chunkById(500, function ($items) use ($conditions) {
            foreach ($items as $item) {
                $selections = $item->selected_printings === null
                    ? null : json_decode($item->selected_printings, true, 512, JSON_THROW_ON_ERROR);
                if ($selections !== null) {
                    foreach ($selections as &$selection) {
                        $selection['conditions'] = $conditions;
                    }
                    unset($selection);
                }
                DB::table('wish_list_items')->where('id', $item->id)->update([
                    'conditions' => json_encode($conditions, JSON_THROW_ON_ERROR),
                    'selected_printings' => $selections === null ? null : json_encode($selections, JSON_THROW_ON_ERROR),
                ]);
            }
        });
    }

    public function down(): void
    {
        DB::table('wish_list_items')->whereNotNull('selected_printings')->orderBy('id')->chunkById(500, function ($items) {
            foreach ($items as $item) {
                $selections = json_decode($item->selected_printings, true, 512, JSON_THROW_ON_ERROR);
                foreach ($selections as &$selection) {
                    unset($selection['conditions']);
                }
                unset($selection);
                DB::table('wish_list_items')->where('id', $item->id)->update([
                    'selected_printings' => json_encode($selections, JSON_THROW_ON_ERROR),
                ]);
            }
        });
        Schema::table('wish_list_items', function (Blueprint $table) {
            $table->dropColumn('conditions');
        });
    }
};
