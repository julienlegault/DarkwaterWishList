<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CardPrinting;
use App\Models\WishList;
use App\Models\WishListItem;
use App\Services\WishListPreviewPrintings;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BulkWishListController extends Controller
{
    public function store(Request $request, int $wishList): JsonResponse
    {
        $list = $request->user()->wishLists()->findOrFail($wishList);
        $validated = $request->validate([
            'line' => ['required_without:lines', 'string', 'max:400'],
            'lines' => ['required_without:line', 'array', 'min:1'],
            'lines.*' => ['required', 'string'],
        ]);

        if (isset($validated['lines'])) {
            $errors = DB::transaction(function () use ($validated, $list, $request) {
                $errors = [];
                foreach ($validated['lines'] as $index => $line) {
                    try {
                        if (mb_strlen($line) > 400) {
                            throw ValidationException::withMessages(['line' => 'The line must not exceed 400 characters.']);
                        }
                        $this->addLine($list, $request, $line);
                    } catch (ValidationException $exception) {
                        $errors[] = ['index' => $index, 'message' => $exception->validator->errors()->first()];
                    }
                }

                return $errors;
            });

            return response()->json(['errors' => $errors]);
        }

        $item = $this->addLine($list, $request, $validated['line']);
        $item->load('printing');
        app(WishListPreviewPrintings::class)->addTo(new Collection([$item]));

        return response()->json(['data' => $item], 201);
    }

    private function addLine(WishList $list, Request $request, string $line): WishListItem
    {
        $line = trim($line);

        if (! preg_match('/^(?:(\d+)\s+)?(.+?)(?:\s+\(([a-z0-9]+)\)\s+(\S+))?(?:\s+\*([FE])\*)?$/iu', $line, $matches)) {
            throw ValidationException::withMessages(['line' => 'Invalid card line.']);
        }

        $quantity = isset($matches[1]) && $matches[1] !== '' ? (int) $matches[1] : 1;
        if ($quantity < 1 || $quantity > 4294967295) {
            throw ValidationException::withMessages(['line' => 'Quantity must be between 1 and 4294967295.']);
        }

        $name = trim($matches[2]);
        $marker = strtoupper($matches[5] ?? '');
        $finish = match ($marker) {
            'F' => 'foil',
            'E' => 'etched',
            default => 'nonfoil',
        };
        $normalizedName = preg_replace('/\s*\/{1,2}\s*/u', ' // ', $name);
        $candidates = array_unique([$name, $normalizedName]);
        $printing = null;
        foreach ($candidates as $candidate) {
            $printing = $this->findPrinting($candidate, $finish, $matches[3] ?? null, $matches[4] ?? null);
            if ($printing) {
                break;
            }
        }
        if (! $printing && ! str_contains($name, '/')) {
            $printing = $this->findPrinting($name, $finish, $matches[3] ?? null, $matches[4] ?? null, frontOnly: true);
        }
        if (! $printing && $marker === '') {
            foreach (['foil', 'etched'] as $alternativeFinish) {
                $printing = $this->findPrinting($name, $alternativeFinish, $matches[3] ?? null, $matches[4] ?? null, flavorOnly: true);
                if ($printing) {
                    $finish = $alternativeFinish;
                    break;
                }
            }
        }

        if (! $printing) {
            throw ValidationException::withMessages(['line' => 'Card, printing, or finish not found.']);
        }

        return DB::transaction(function () use ($list, $request, $printing, $quantity, $finish) {
            $catalogId = $printing->oracle_id ?? $printing->scryfall_id;
            $item = $list->items()->where('catalog_id', $catalogId)->lockForUpdate()->first();

            if (! $item) {
                return $list->items()->create([
                    'user_id' => $request->user()->id,
                    'catalog_id' => $catalogId,
                    'scryfall_id' => $printing->scryfall_id,
                    'card_name' => $printing->name,
                    'foil' => $finish !== 'nonfoil',
                    'foil_preference' => $finish,
                    'any_printing' => false,
                    'total_quantity' => $quantity,
                    'any_printing_quantity' => $quantity,
                    'selected_printings' => [['scryfall_id' => $printing->scryfall_id, 'quantity' => $quantity, 'foil_preference' => $finish, 'conditions' => WishListItem::CONDITIONS]],
                    'tcgplayer_id' => $printing->tcgplayer_id,
                    'in_stock' => false,
                ]);
            }

            if ($item->any_printing) {
                throw ValidationException::withMessages(['line' => 'Turn off Any Printing for this card before adding specific printings.']);
            }
            $selections = $item->selected_printings ?? [[
                'scryfall_id' => $item->scryfall_id,
                'quantity' => 1,
                'foil_preference' => $item->foil_preference,
                'conditions' => WishListItem::CONDITIONS,
            ]];
            $index = array_search($printing->scryfall_id, array_column($selections, 'scryfall_id'), true);
            if ($index !== false && ($selections[$index]['foil_preference'] ?? $item->foil_preference) !== $finish) {
                throw ValidationException::withMessages(['line' => 'This printing already has a different foil preference.']);
            }
            if ($item->total_quantity + $quantity > 4294967295
                || ($index !== false && $selections[$index]['quantity'] + $quantity > 4294967295)) {
                throw ValidationException::withMessages(['line' => 'The combined quantity is too large.']);
            }
            if ($index === false) {
                $selections[] = ['scryfall_id' => $printing->scryfall_id, 'quantity' => $quantity, 'foil_preference' => $finish, 'conditions' => WishListItem::CONDITIONS];
            } else {
                $selections[$index]['quantity'] += $quantity;
            }
            $item->total_quantity += $quantity;
            $item->any_printing_quantity = $item->total_quantity;
            $item->selected_printings = $selections;
            $item->save();

            return $item;
        });
    }

    private function findPrinting(string $name, string $finish, ?string $set, ?string $number, bool $frontOnly = false, bool $flavorOnly = false): ?CardPrinting
    {
        $query = CardPrinting::query()->where(function ($query) use ($name, $frontOnly, $flavorOnly) {
            if ($frontOnly) {
                $query->whereRaw('LOWER(front_name) = LOWER(?)', [$name]);
            } elseif ($flavorOnly) {
                $query->whereRaw('LOWER(flavor_name) = LOWER(?)', [$name]);
            } else {
                $query->whereRaw('LOWER(name) = LOWER(?)', [$name])
                    ->orWhereRaw('LOWER(flavor_name) = LOWER(?)', [$name]);
            }
        });
        if ($set !== null && $set !== '') {
            $query->whereRaw('LOWER(set_code) = LOWER(?)', [$set])
                ->whereRaw('LOWER(collector_number) = LOWER(?)', [$number]);
        }

        return $query->orderByDesc('released_at')
            ->orderByRaw("CASE WHEN lang = 'en' THEN 0 ELSE 1 END")->orderBy('scryfall_id')
            ->cursor(['scryfall_id', 'oracle_id', 'name', 'tcgplayer_id', 'finishes'])
            ->first(fn (CardPrinting $card) => $card->finishes === null || in_array($finish, $card->finishes, true));
    }
}
