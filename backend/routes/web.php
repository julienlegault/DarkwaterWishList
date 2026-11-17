<?php

use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\LocalAuthController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;

Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect'])
    ->name('auth.google.redirect');
Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback'])
    ->name('auth.google.callback');

Route::post('/auth/logout', function (Request $request) {
    Auth::guard('web')->logout();
    $request->session()->invalidate();
    $request->session()->regenerateToken();

    return response()->noContent();
})->name('auth.logout');

if (app()->isLocal() || app()->environment('testing')) {
    Route::post('/auth/local/login', [LocalAuthController::class, 'login'])
        ->name('auth.local.login');
}

Route::get('/', function () {
    $frontend = public_path('frontend/index.html');

    if (is_file($frontend)) {
        return response()->file($frontend);
    }

    return response()->json([
        'name' => 'Darkwater Wish List API',
        'docs' => url('/api/health'),
    ]);
});
