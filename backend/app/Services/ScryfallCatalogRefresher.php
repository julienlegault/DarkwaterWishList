<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class ScryfallCatalogRefresher
{
    public function __construct(private readonly ScryfallCatalogImporter $importer) {}

    public function refresh(): int
    {
        $bulkData = Http::withUserAgent('DarkwaterWishList/1.0')
            ->acceptJson()
            ->timeout(30)
            ->get('https://api.scryfall.com/bulk-data')
            ->throw()
            ->json('data');

        $defaultCards = collect($bulkData)->firstWhere('type', 'default_cards');
        $downloadUri = $defaultCards['jsonl_download_uri'] ?? null;
        $host = is_string($downloadUri) ? parse_url($downloadUri, PHP_URL_HOST) : null;
        if (! is_string($downloadUri)
            || parse_url($downloadUri, PHP_URL_SCHEME) !== 'https'
            || ! in_array($host, ['api.scryfall.com', 'data.scryfall.io'], true)) {
            throw new RuntimeException('Scryfall did not provide a supported default-cards download URL.');
        }

        $path = tempnam(sys_get_temp_dir(), 'scryfall-cards-');
        if ($path === false) {
            throw new RuntimeException('Unable to create a temporary Scryfall catalog file.');
        }

        try {
            Http::withUserAgent('DarkwaterWishList/1.0')
                ->withOptions(['sink' => $path])
                ->timeout(300)
                ->get($downloadUri)
                ->throw();

            return $this->importer->importFile($path);
        } finally {
            if (is_file($path)) {
                unlink($path);
            }
        }
    }
}
