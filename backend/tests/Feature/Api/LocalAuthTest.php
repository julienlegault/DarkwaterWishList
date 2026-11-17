<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LocalAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_local_login_creates_user_with_email(): void
    {
        $this->post('/auth/local/login', ['email' => 'dev@example.com'])
            ->assertOk()->assertJson(['message' => 'Signed in.']);

        $user = User::where('email', 'dev@example.com')->firstOrFail();

        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->email_verified_at);
        $this->assertEquals('dev', $user->name);
    }

    public function test_local_login_reuses_existing_user(): void
    {
        $user = User::factory()->create(['email' => 'existing@example.com']);

        $this->post('/auth/local/login', ['email' => 'existing@example.com'])
            ->assertOk();

        $this->assertAuthenticatedAs($user);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_local_login_email_is_case_insensitive(): void
    {
        $this->post('/auth/local/login', ['email' => 'Dev@Example.COM'])
            ->assertOk();

        $user = User::where('email', 'dev@example.com')->firstOrFail();

        $this->assertAuthenticatedAs($user);
    }

    public function test_local_login_requires_valid_email(): void
    {
        $this->post('/auth/local/login', ['email' => 'not-an-email'])
            ->assertSessionHasErrors('email');

        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_local_login_with_no_email(): void
    {
        $this->post('/auth/local/login', [])
            ->assertSessionHasErrors('email');

        $this->assertGuest();
    }

    public function test_user_can_access_api_after_local_login(): void
    {
        $this->post('/auth/local/login', ['email' => 'dev@example.com']);

        $this->withHeader('Origin', 'http://localhost:5173')
            ->getJson('/api/user')
            ->assertOk()
            ->assertJson(['email' => 'dev@example.com']);
    }

    public function test_logout_invalidates_the_session_and_allows_signing_in_again(): void
    {
        $this->post('/auth/local/login', ['email' => 'dev@example.com'])->assertOk();
        $this->withSession(['logout_test' => 'session data'])
            ->postJson('/auth/logout')
            ->assertNoContent()
            ->assertSessionMissing('logout_test');

        $this->assertGuest();
        $this->withHeader('Origin', 'http://localhost:5173')
            ->getJson('/api/user')
            ->assertUnauthorized();

        $this->post('/auth/local/login', ['email' => 'dev@example.com'])->assertOk();
        $this->assertAuthenticated();
    }
}


