<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CardPrinting;
use App\Models\WishList;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WishListController extends Controller
{
    private function list(Request $request, ?int $wishList): WishList
    {
        if ($wishList !== null) {
            return $request->user()->wishLists()->findOrFail($wishList);
        }

        return $request->user()->wishLists()->orderBy('id')->first()
            ?? $request->user()->wishLists()->create(['name' => 'Wish List']);
    }

    public function index(Request $request, ?int $wishList = null): JsonResponse
    {
        $items = $this->list($request, $wishList)->items()->with('printing')->orderBy('card_name')->get();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request, ?int $wishList = null): JsonResponse
    {
        $list = $this->list($request, $wishList);
        $validated = $request->validate([
            'scryfall_id' => ['required', 'string', Rule::exists('card_printings', 'scryfall_id')],
            'foil' => ['sometimes', 'boolean'],
        ]);

        $printing = CardPrinting::query()->findOrFail($validated['scryfall_id']);
        $catalogId = $printing->oracle_id ?? $printing->scryfall_id;

        $item = $list->items()->updateOrCreate(
            ['catalog_id' => $catalogId],
            [
                'scryfall_id' => $printing->scryfall_id,
                'card_name' => $printing->name,
                'foil' => $validated['foil'] ?? false,
                'tcgplayer_id' => $printing->tcgplayer_id,
                'in_stock' => false,
                'user_id' => $request->user()->id,
            ],
        );

        return response()->json(['data' => $item->load('printing')], 201);
    }

    public function update(Request $request, int $wishList, ?int $wishListItem = null): JsonResponse
    {
        $item = $this->list($request, $wishListItem === null ? null : $wishList)
            ->items()->findOrFail($wishListItem ?? $wishList);

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

    public function destroy(Request $request, int $wishList, ?int $wishListItem = null): JsonResponse
    {
        $item = $this->list($request, $wishListItem === null ? null : $wishList)
            ->items()->findOrFail($wishListItem ?? $wishList);
        $item->delete();

        return response()->json(status: 204);
    }
}
