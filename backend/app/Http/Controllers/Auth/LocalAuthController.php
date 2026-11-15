<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LocalAuthController extends Controller
{
    /**
     * Login via email (development only).
     * This endpoint is only available in local development environments.
     *
     * @throws ValidationException
     */
    public function login(Request $request): JsonResponse
    {
        $email = $request->validate([
            'email' => 'required|email|max:255',
        ])['email'];

        $email = Str::lower(trim($email));

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw ValidationException::withMessages([
                'email' => 'The email format is invalid.',
            ]);
        }

        $user = User::firstOrNew(
            ['email' => $email],
            [
                'name' => explode('@', $email)[0],
                'password' => Str::random(64),
                'email_verified_at' => now(),
            ],
        );
        $user->email_verified_at ??= now();
        $user->save();

        Auth::login($user);
        $request->session()->regenerate();

        return response()->json(['message' => 'Signed in.']);
    }
}
