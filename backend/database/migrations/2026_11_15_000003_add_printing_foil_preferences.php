<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('wish_list_items')->orderBy('id')->chunkById(500, function ($items) {
            foreach ($items as $item) {
                if ($item->selected_printings === null) {
                    continue;
                }
                $selections = json_decode($item->selected_printings, true, 512, JSON_THROW_ON_ERROR);
                foreach ($selections as &$selection) {
                    $selection['foil_preference'] ??= $item->foil_preference;
                }
                unset($selection);
                DB::table('wish_list_items')->where('id', $item->id)->update([
                    'selected_printings' => json_encode($selections, JSON_THROW_ON_ERROR),
                ]);
            }
        });
    }

    public function down(): void
    {
        DB::table('wish_list_items')->orderBy('id')->chunkById(500, function ($items) {
            foreach ($items as $item) {
                if ($item->selected_printings === null) {
                    continue;
                }
                $selections = json_decode($item->selected_printings, true, 512, JSON_THROW_ON_ERROR);
                foreach ($selections as &$selection) {
                    unset($selection['foil_preference']);
                }
                unset($selection);
                DB::table('wish_list_items')->where('id', $item->id)->update([
                    'selected_printings' => json_encode($selections, JSON_THROW_ON_ERROR),
                ]);
            }
        });
    }
};
