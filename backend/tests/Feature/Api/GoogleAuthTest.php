<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Laravel\Socialite\Contracts\Provider;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as GoogleUser;
use Mockery;
use Tests\TestCase;

class GoogleAuthTest extends TestCase
{
    public function test_verified_google_email_authenticates_and_reuses_the_user(): void
    {
        $this->mockGoogleAccount('wishlist@example.com');

        $this->get('/auth/google/callback')
            ->assertRedirect(config('services.frontend_url'));

        $user = User::where('email', 'wishlist@example.com')->firstOrFail();

        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->email_verified_at);

        $this->withHeader('Origin', 'http://localhost:5173')
            ->getJson('/api/user')
            ->assertOk()
            ->assertJson([
                'id' => $user->id,
                'email' => 'wishlist@example.com',
            ]);

        $this->get('/auth/google/callback')
            ->assertRedirect(config('services.frontend_url'));

        $this->assertDatabaseCount('users', 1);
        $this->assertAuthenticatedAs($user);
    }

    public function test_unverified_google_email_is_rejected(): void
    {
        $this->mockGoogleAccount('wishlist@example.com', false);

        $this->get('/auth/google/callback')->assertForbidden();

        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_user_endpoint_rejects_unauthenticated_requests(): void
    {
        $this->getJson('/api/user')->assertUnauthorized();
    }

    private function mockGoogleAccount(string $email, bool $verified = true): void
    {
        $googleUser = new GoogleUser;
        $googleUser->email = $email;
        $googleUser->name = 'Wish Lister';
        $googleUser->user = ['email_verified' => $verified];

        $provider = Mockery::mock(Provider::class);
        $provider->shouldReceive('user')->andReturn($googleUser);

        Socialite::shouldReceive('driver')
            ->with('google')
            ->andReturn($provider);
    }
}
