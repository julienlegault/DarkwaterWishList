<?php

namespace App\Console\Commands;

use App\Services\ScryfallCatalogImporter;
use App\Services\ScryfallCatalogRefresher;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class RefreshScryfallCatalog extends Command
{
    protected $signature = 'scryfall:refresh {--file= : Import an existing Scryfall default_cards JSON file}';

    protected $description = 'Import or refresh the Scryfall card-printing catalog';

    public function handle(ScryfallCatalogImporter $importer, ScryfallCatalogRefresher $refresher): int
    {
        try {
            $count = $this->withLock(fn () => $this->option('file')
                ? $importer->importFile($this->option('file'))
                : $refresher->refresh());
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $this->info($count === null ? 'Scryfall catalog is already up to date.' : "Imported {$count} card printings.");

        return self::SUCCESS;
    }

    private function withLock(callable $refresh): ?int
    {
        if (DB::getDriverName() === 'mysql') {
            $connection = DB::connection();
            $acquired = $connection->selectOne('SELECT GET_LOCK(?, 0) AS acquired', ['scryfall_catalog_refresh']);
            if ((int) $acquired->acquired !== 1) {
                throw new RuntimeException('Another Scryfall catalog refresh is running.');
            }

            try {
                return $refresh();
            } finally {
                $connection->selectOne('SELECT RELEASE_LOCK(?) AS released', ['scryfall_catalog_refresh']);
            }
        }

        $lock = Cache::store('database')->lock('scryfall_catalog_refresh', 7200);
        if (! $lock->get()) {
            throw new RuntimeException('Another Scryfall catalog refresh is running.');
        }

        try {
            return $refresh();
        } finally {
            $lock->release();
        }
    }
}
