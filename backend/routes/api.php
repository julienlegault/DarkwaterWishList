<?php

use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\CardCatalogController;
use App\Http\Controllers\Api\WishListController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::middleware('auth:sanctum')->get('/user', function (\Illuminate\Http\Request $request) {
    return $request->user()->only(['id', 'name', 'email']);
});

Route::middleware('auth:sanctum')->prefix('cards')->controller(CardCatalogController::class)->group(function (): void {
    Route::get('/search', 'search');
    Route::get('/{catalogId}/printings', 'printings');
});

Route::middleware('auth:sanctum')->prefix('wishlist')->controller(WishListController::class)->group(function (): void {
    Route::get('/', 'index');
    Route::post('/', 'store');
    Route::patch('/{wishListItem}', 'update');
    Route::delete('/{wishListItem}', 'destroy');
});
