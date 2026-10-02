<?php

namespace App\Console\Commands;

use App\Services\ScryfallCatalogImporter;
use App\Services\ScryfallCatalogRefresher;
use Illuminate\Console\Command;
use Throwable;

class RefreshScryfallCatalog extends Command
{
    protected $signature = 'scryfall:refresh {--file= : Import an existing Scryfall default_cards JSON file}';

    protected $description = 'Import or refresh the Scryfall card-printing catalog';

    public function handle(ScryfallCatalogImporter $importer, ScryfallCatalogRefresher $refresher): int
    {
        try {
            $count = $this->option('file')
                ? $importer->importFile($this->option('file'))
                : $refresher->refresh();
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $this->info("Imported {$count} card printings.");

        return self::SUCCESS;
    }
}
