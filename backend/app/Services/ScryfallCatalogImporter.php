<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use JsonException;
use RuntimeException;

class ScryfallCatalogImporter
{
    private const BATCH_SIZE = 70;

    public function importFile(string $path): int
    {
        if (! is_file($path) || ! is_readable($path)) {
            throw new RuntimeException("Scryfall bulk data file is not readable: {$path}");
        }

        $imported = 0;

        DB::transaction(function () use ($path, &$imported): void {
            DB::table('card_printings')->delete();
            $batch = [];
            $timestamp = now();

            foreach ($this->cardsFromFile($path) as $card) {
                if (is_array($card['games'] ?? null) && ! in_array('paper', $card['games'], true)) {
                    continue;
                }

                if (! is_string($card['id'] ?? null) || ! is_string($card['name'] ?? null)) {
                    throw new RuntimeException('Scryfall bulk data contains a card without an ID or name.');
                }

                $faces = $this->cardFaces($card['card_faces'] ?? null);
                $batch[] = [
                    'scryfall_id' => $card['id'],
                    'oracle_id' => is_string($card['oracle_id'] ?? null) ? $card['oracle_id'] : null,
                    'name' => $card['name'],
                    'set_code' => is_string($card['set'] ?? null) ? $card['set'] : null,
                    'set_name' => is_string($card['set_name'] ?? null) ? $card['set_name'] : null,
                    'collector_number' => is_string($card['collector_number'] ?? null) ? $card['collector_number'] : null,
                    'released_at' => is_string($card['released_at'] ?? null) ? $card['released_at'] : null,
                    'lang' => is_string($card['lang'] ?? null) ? $card['lang'] : null,
                    'tcgplayer_id' => is_numeric($card['tcgplayer_id'] ?? null) ? (int) $card['tcgplayer_id'] : null,
                    'image_uris' => $this->encode($card['image_uris'] ?? null),
                    'card_faces' => $this->encode($faces),
                    'finishes' => $this->encode(is_array($card['finishes'] ?? null) ? $card['finishes'] : null),
                    'created_at' => $timestamp,
                    'updated_at' => $timestamp,
                ];

                if (count($batch) >= self::BATCH_SIZE) {
                    $this->saveBatch($batch);
                    $imported += count($batch);
                    $batch = [];
                }
            }

            if ($batch !== []) {
                $this->saveBatch($batch);
                $imported += count($batch);
            }

            if ($imported === 0) {
                throw new RuntimeException('Scryfall bulk data contained no importable card printings.');
            }
        });

        return $imported;
    }

    private function saveBatch(array $batch): void
    {
        DB::table('card_printings')->upsert(
            $batch,
            ['scryfall_id'],
            [
                'oracle_id', 'name', 'set_code', 'set_name', 'collector_number',
                'released_at', 'lang', 'tcgplayer_id', 'image_uris', 'card_faces',
                'finishes', 'updated_at',
            ],
        );
    }

    private function cardsFromFile(string $path): \Generator
    {
        $handle = fopen($path, 'rb');
        if ($handle === false) {
            throw new RuntimeException("Unable to open Scryfall bulk data file: {$path}");
        }

        try {
            $signature = fread($handle, 2);
            rewind($handle);

            if ($signature === "\x1f\x8b") {
                fclose($handle);
                yield from $this->cardsFromGzipJsonLines($path);

                return;
            }

            $firstCharacter = '';
            while (($character = fgetc($handle)) !== false) {
                if (! ctype_space($character)) {
                    $firstCharacter = $character;
                    break;
                }
            }
            rewind($handle);

            if ($firstCharacter === '[') {
                yield from $this->cardsFromJsonArray($handle);
            } else {
                yield from $this->cardsFromJsonLines($handle);
            }
        } finally {
            if (is_resource($handle)) {
                fclose($handle);
            }
        }
    }

    private function cardsFromGzipJsonLines(string $path): \Generator
    {
        $handle = gzopen($path, 'rb');
        if ($handle === false) {
            throw new RuntimeException('Unable to open compressed Scryfall bulk data file.');
        }

        try {
            yield from $this->cardsFromJsonLines($handle, true);
        } finally {
            gzclose($handle);
        }
    }

    private function cardsFromJsonLines($handle, bool $compressed = false): \Generator
    {
        $lineNumber = 0;
        while (($line = $compressed ? gzgets($handle) : fgets($handle)) !== false) {
            $lineNumber++;
            $line = trim($line);
            if ($line === '') {
                continue;
            }

            try {
                $card = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException $exception) {
                throw new RuntimeException("Scryfall JSONL contains invalid JSON on line {$lineNumber}.", previous: $exception);
            }

            if (! is_array($card)) {
                throw new RuntimeException("Scryfall JSONL contains a non-object item on line {$lineNumber}.");
            }

            yield $card;
        }
    }

    private function cardsFromJsonArray($handle): \Generator
    {
        $rootOpened = false;
        $rootClosed = false;
        $inObject = false;
        $objectDepth = 0;
        $inString = false;
        $escaped = false;
        $object = '';

        while (! feof($handle)) {
            $chunk = fread($handle, 1024 * 1024);
            if ($chunk === false) {
                throw new RuntimeException('Unable to read Scryfall bulk data file.');
            }

            $length = strlen($chunk);
            for ($index = 0; $index < $length; $index++) {
                $character = $chunk[$index];

                if (! $rootOpened) {
                    if (ctype_space($character)) {
                        continue;
                    }
                    if ($character !== '[') {
                        throw new RuntimeException('Scryfall bulk data must be a JSON array.');
                    }
                    $rootOpened = true;

                    continue;
                }

                if ($rootClosed) {
                    if (! ctype_space($character)) {
                        throw new RuntimeException('Unexpected data after Scryfall bulk data array.');
                    }

                    continue;
                }

                if (! $inObject) {
                    if (ctype_space($character) || $character === ',') {
                        continue;
                    }
                    if ($character === ']') {
                        $rootClosed = true;

                        continue;
                    }
                    if ($character !== '{') {
                        throw new RuntimeException('Scryfall bulk data array contains a non-object item.');
                    }

                    $inObject = true;
                    $objectDepth = 1;
                    $object = '{';

                    continue;
                }

                $object .= $character;

                if ($inString) {
                    if ($escaped) {
                        $escaped = false;
                    } elseif ($character === '\\') {
                        $escaped = true;
                    } elseif ($character === '"') {
                        $inString = false;
                    }

                    continue;
                }

                if ($character === '"') {
                    $inString = true;
                } elseif ($character === '{') {
                    $objectDepth++;
                } elseif ($character === '}') {
                    $objectDepth--;
                    if ($objectDepth === 0) {
                        try {
                            $card = json_decode($object, true, 512, JSON_THROW_ON_ERROR);
                        } catch (JsonException $exception) {
                            throw new RuntimeException('Scryfall bulk data contains invalid JSON.', previous: $exception);
                        }

                        if (! is_array($card)) {
                            throw new RuntimeException('Scryfall bulk data contains a non-object item.');
                        }

                        yield $card;
                        $object = '';
                        $inObject = false;
                    }
                }
            }
        }

        if (! $rootOpened || ! $rootClosed || $inObject) {
            throw new RuntimeException('Scryfall bulk data JSON array is incomplete.');
        }
    }

    private function cardFaces(mixed $faces): ?array
    {
        if (! is_array($faces)) {
            return null;
        }

        return array_values(array_filter(array_map(
            static fn (mixed $face): ?array => is_array($face)
                ? array_filter([
                    'name' => is_string($face['name'] ?? null) ? $face['name'] : null,
                    'image_uris' => is_array($face['image_uris'] ?? null) ? $face['image_uris'] : null,
                ], static fn (mixed $value): bool => $value !== null)
                : null,
            $faces,
        )));
    }

    private function encode(mixed $value): ?string
    {
        return $value === null ? null : json_encode($value, JSON_THROW_ON_ERROR);
    }
}
