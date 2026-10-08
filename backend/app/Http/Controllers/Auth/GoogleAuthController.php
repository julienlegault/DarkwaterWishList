<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as GoogleUser;

class GoogleAuthController extends Controller
{
    public function redirect(): RedirectResponse
    {
        return Socialite::driver('google')->redirect();
    }

    public function callback(Request $request): RedirectResponse
    {
        /** @var GoogleUser $googleUser */
        $googleUser = Socialite::driver('google')->user();
        $email = $googleUser->getEmail();
        $verified = $googleUser->user['email_verified']
            ?? $googleUser->user['verified_email']
            ?? false;

        if (! is_string($email) || ! filter_var($email, FILTER_VALIDATE_EMAIL)
            || ! filter_var($verified, FILTER_VALIDATE_BOOLEAN)) {
            abort(403, 'A verified Google email address is required.');
        }

        $email = Str::lower(trim($email));
        $user = User::firstOrNew(
            ['email' => $email],
            [
                'name' => $googleUser->getName() ?: $email,
                'password' => Str::random(64),
                'email_verified_at' => now(),
            ],
        );
        $user->email_verified_at ??= now();
        $user->save();

        Auth::login($user);
        $request->session()->regenerate();

        return redirect()->to(config('services.frontend_url'));
    }
}
