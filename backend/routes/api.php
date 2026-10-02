<?php

use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\CardCatalogController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::middleware('auth:sanctum')->get('/user', function (\Illuminate\Http\Request $request) {
    return $request->user()->only(['id', 'name', 'email']);
});

Route::middleware('auth:sanctum')->prefix('cards')->controller(CardCatalogController::class)->group(function (): void {
    Route::get('/search', 'search');
    Route::get('/{catalogId}/printings', 'printings');
});
