<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('wish_list_items')->orderBy('id')->chunkById(500, function ($items) {
            foreach ($items as $item) {
                $this->quantityFor($item);
            }
        });

        Schema::table('wish_list_items', function (Blueprint $table) {
            $table->unsignedInteger('total_quantity')->default(1);
        });

        DB::table('wish_list_items')->orderBy('id')->chunkById(500, function ($items) {
            foreach ($items as $item) {
                DB::table('wish_list_items')->where('id', $item->id)->update([
                    'total_quantity' => $this->quantityFor($item),
                ]);
            }

        });
    }

    private function quantityFor(object $item): int
    {
        $selections = $item->selected_printings === null
            ? []
            : json_decode($item->selected_printings, true, 512, JSON_THROW_ON_ERROR);
        $quantity = $item->any_printing || count($selections) === 0
            ? $item->any_printing_quantity
            : array_sum(array_column($selections, 'quantity'));
        if ($quantity < 1 || $quantity > 4294967295) {
            throw new RuntimeException("Cannot migrate wish list item {$item->id}: total quantity is out of range.");
        }

        return (int) $quantity;
    }

    public function down(): void
    {
        Schema::table('wish_list_items', function (Blueprint $table) {
            $table->dropColumn('total_quantity');
        });
    }
};
