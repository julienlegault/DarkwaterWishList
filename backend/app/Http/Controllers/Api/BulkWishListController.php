<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CardPrinting;
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
        $validated = $request->validate(['line' => ['required', 'string', 'max:400']]);
        $line = trim($validated['line']);

        if (! preg_match('/^(?:(\d+)\s+)?(.+?)(?:\s+\(([a-z0-9]+)\)\s+(\S+))?(?:\s+(\*F\*))?$/iu', $line, $matches)) {
            throw ValidationException::withMessages(['line' => 'Invalid card line.']);
        }

        $quantity = isset($matches[1]) && $matches[1] !== '' ? (int) $matches[1] : 1;
        if ($quantity < 1 || $quantity > 4294967295) {
            throw ValidationException::withMessages(['line' => 'Quantity must be between 1 and 4294967295.']);
        }

        $name = trim($matches[2]);
        $foil = ! empty($matches[5]);
        $finish = $foil ? 'foil' : 'nonfoil';
        $query = CardPrinting::query()->whereRaw('LOWER(name) = LOWER(?)', [$name]);
        if (! empty($matches[3])) {
            $query->whereRaw('LOWER(set_code) = LOWER(?)', [$matches[3]])
                ->whereRaw('LOWER(collector_number) = LOWER(?)', [$matches[4]]);
        }
        $printing = $query->orderByDesc('released_at')
            ->orderByRaw("CASE WHEN lang = 'en' THEN 0 ELSE 1 END")->orderBy('scryfall_id')->get()
            ->first(fn (CardPrinting $card) => $card->finishes === null || in_array($finish, $card->finishes, true));

        if (! $printing) {
            throw ValidationException::withMessages(['line' => 'Card, printing, or finish not found.']);
        }

        $item = DB::transaction(function () use ($list, $request, $printing, $quantity, $foil, $finish) {
            $catalogId = $printing->oracle_id ?? $printing->scryfall_id;
            $item = $list->items()->where('catalog_id', $catalogId)->lockForUpdate()->first();

            if (! $item) {
                return $list->items()->create([
                    'user_id' => $request->user()->id,
                    'catalog_id' => $catalogId,
                    'scryfall_id' => $printing->scryfall_id,
                    'card_name' => $printing->name,
                    'foil' => $foil,
                    'foil_preference' => $finish,
                    'any_printing' => false,
                    'total_quantity' => $quantity,
                    'any_printing_quantity' => $quantity,
                    'selected_printings' => [['scryfall_id' => $printing->scryfall_id, 'quantity' => $quantity, 'foil_preference' => $finish]],
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
                $selections[] = ['scryfall_id' => $printing->scryfall_id, 'quantity' => $quantity, 'foil_preference' => $finish];
            } else {
                $selections[$index]['quantity'] += $quantity;
            }
            $item->total_quantity += $quantity;
            $item->any_printing_quantity = $item->total_quantity;
            $item->selected_printings = $selections;
            $item->save();

            return $item;
        });

        $item->load('printing');
        app(WishListPreviewPrintings::class)->addTo(new Collection([$item]));

        return response()->json(['data' => $item], 201);
    }
}
