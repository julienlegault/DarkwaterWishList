<?php

$stateful = explode(',', env(
    'SANCTUM_STATEFUL_DOMAINS',
    'localhost:5173,127.0.0.1:5173,localhost,127.0.0.1',
));

if (env('APP_ENV') === 'local' && env('CODESPACES') === true
    && env('CODESPACE_NAME') && env('GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN')) {
    $stateful[] = env('CODESPACE_NAME').'-5173.'.env('GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN');
}

return [
    'stateful' => $stateful,

    'guard' => ['web'],

    'expiration' => null,

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    'middleware' => [
        'authenticate_session' => Laravel\Sanctum\Http\Middleware\AuthenticateSession::class,
        'encrypt_cookies' => Illuminate\Cookie\Middleware\EncryptCookies::class,
        'validate_csrf_token' => Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
    ],
];
