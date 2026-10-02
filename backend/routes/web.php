<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'name' => 'Darkwater Wish List API',
        'docs' => url('/api/health'),
    ]);
});
