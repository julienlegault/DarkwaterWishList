<?php

use App\Http\Controllers\Api\BulkWishListController;
use App\Http\Controllers\Api\CardCatalogController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\WishListController;
use App\Http\Controllers\Api\WishListsController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
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

Route::middleware('auth:sanctum')->prefix('wish-lists')->group(function (): void {
    Route::get('/', [WishListsController::class, 'index']);
    Route::post('/', [WishListsController::class, 'store']);
    Route::patch('/{wishList}', [WishListsController::class, 'update']);
    Route::delete('/{wishList}', [WishListsController::class, 'destroy']);
    Route::get('/{wishList}/items', [WishListController::class, 'index']);
    Route::post('/{wishList}/items', [WishListController::class, 'store']);
    Route::post('/{wishList}/bulk-items', [BulkWishListController::class, 'store']);
    Route::patch('/{wishList}/items/{wishListItem}', [WishListController::class, 'update']);
    Route::delete('/{wishList}/items/{wishListItem}', [WishListController::class, 'destroy']);
});
