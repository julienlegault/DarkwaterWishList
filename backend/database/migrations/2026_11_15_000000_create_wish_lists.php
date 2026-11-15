<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wish_lists', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->boolean('notify_me')->default(false);
            $table->timestamps();
        });

        Schema::table('wish_list_items', function (Blueprint $table) {
            $table->foreignId('wish_list_id')->nullable()->constrained('wish_lists')->cascadeOnDelete();
        });

        foreach (DB::table('wish_list_items')->distinct()->pluck('user_id') as $userId) {
            $listId = DB::table('wish_lists')->insertGetId([
                'user_id' => $userId,
                'name' => 'Wish List',
                'notify_me' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('wish_list_items')->where('user_id', $userId)->update(['wish_list_id' => $listId]);
        }

        Schema::table('wish_list_items', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'catalog_id']);
            $table->foreignId('wish_list_id')->nullable(false)->change();
            $table->unique(['wish_list_id', 'catalog_id']);
        });
    }

    public function down(): void
    {
        $duplicates = DB::table('wish_list_items')
            ->select('user_id', 'catalog_id')
            ->groupBy('user_id', 'catalog_id')
            ->havingRaw('COUNT(*) > 1')
            ->exists();
        if ($duplicates) {
            throw new RuntimeException('Cannot roll back wish lists while a card appears in multiple lists.');
        }

        Schema::table('wish_list_items', function (Blueprint $table) {
            $table->dropUnique(['wish_list_id', 'catalog_id']);
            $table->dropConstrainedForeignId('wish_list_id');
            $table->unique(['user_id', 'catalog_id']);
        });
        Schema::dropIfExists('wish_lists');
    }
};
