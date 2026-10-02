<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CardPrinting;
use App\Models\WishListItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WishListController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $items = $request->user()->wishListItems()->with('printing')->orderBy('card_name')->get();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'scryfall_id' => ['required', 'string', Rule::exists('card_printings', 'scryfall_id')],
            'foil' => ['sometimes', 'boolean'],
        ]);

        $printing = CardPrinting::query()->findOrFail($validated['scryfall_id']);
        $catalogId = $printing->oracle_id ?? $printing->scryfall_id;

        $item = $request->user()->wishListItems()->updateOrCreate(
            ['catalog_id' => $catalogId],
            [
                'scryfall_id' => $printing->scryfall_id,
                'card_name' => $printing->name,
                'foil' => $validated['foil'] ?? false,
                'tcgplayer_id' => $printing->tcgplayer_id,
                'in_stock' => false,
            ],
        );

        return response()->json(['data' => $item->load('printing')], 201);
    }

    public function update(Request $request, int $wishListItem): JsonResponse
    {
        $item = $request->user()->wishListItems()->findOrFail($wishListItem);

        $validated = $request->validate([
            'scryfall_id' => ['sometimes', 'string', Rule::exists('card_printings', 'scryfall_id')],
            'foil' => ['sometimes', 'boolean'],
        ]);

        if (isset($validated['scryfall_id'])) {
            $printing = CardPrinting::query()->findOrFail($validated['scryfall_id']);
            $catalogId = $printing->oracle_id ?? $printing->scryfall_id;

            if ($catalogId !== $item->catalog_id) {
                throw ValidationException::withMessages([
                    'scryfall_id' => 'The selected printing does not match this wish list item.',
                ]);
            }

            $item->scryfall_id = $printing->scryfall_id;
            $item->card_name = $printing->name;
            $item->tcgplayer_id = $printing->tcgplayer_id;
            $item->in_stock = false;
        }

        if (array_key_exists('foil', $validated)) {
            $item->foil = $validated['foil'];
        }

        $item->save();

        return response()->json(['data' => $item->load('printing')]);
    }

    public function destroy(Request $request, int $wishListItem): JsonResponse
    {
        $item = $request->user()->wishListItems()->findOrFail($wishListItem);
        $item->delete();

        return response()->json(status: 204);
    }
}
