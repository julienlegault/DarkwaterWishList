<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wish_lists', function (Blueprint $table) {
            $table->boolean('notify_me')->default(true)->change();
        });
    }

    public function down(): void
    {
        Schema::table('wish_lists', function (Blueprint $table) {
            $table->boolean('notify_me')->default(false)->change();
        });
    }
};
