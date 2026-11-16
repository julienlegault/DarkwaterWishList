<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CardPrinting;
use App\Models\WishList;
use App\Services\WishListPreviewPrintings;
use Illuminate\Database\Eloquent\Collection;
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
        $query = $this->list($request, $wishList)->items()->with('printing')->orderBy('card_name')->orderBy('id');
        if ($request->boolean('paginated')) {
            $page = $query->cursorPaginate(30);
            app(WishListPreviewPrintings::class)->addTo($page->getCollection());

            return response()->json(['data' => $page->items(), 'next_cursor' => $page->nextCursor()?->encode()]);
        }

        $items = $query->get();
        app(WishListPreviewPrintings::class)->addTo($items);

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
                'foil_preference' => ($validated['foil'] ?? false) ? 'foil' : 'nonfoil',
                'selected_printings' => [['scryfall_id' => $printing->scryfall_id, 'quantity' => 1, 'foil_preference' => ($validated['foil'] ?? false) ? 'foil' : 'nonfoil']],
                'tcgplayer_id' => $printing->tcgplayer_id,
                'in_stock' => false,
                'user_id' => $request->user()->id,
            ],
        );

        $item->refresh()->load('printing');
        app(WishListPreviewPrintings::class)->addTo(new Collection([$item]));

        return response()->json(['data' => $item], 201);
    }

    public function update(Request $request, int $wishList, ?int $wishListItem = null): JsonResponse
    {
        $item = $this->list($request, $wishListItem === null ? null : $wishList)
            ->items()->findOrFail($wishListItem ?? $wishList);

        $validated = $request->validate([
            'scryfall_id' => ['sometimes', 'string', Rule::exists('card_printings', 'scryfall_id')],
            'foil' => ['sometimes', 'boolean'],
            'foil_preference' => ['sometimes', Rule::in(['foil', 'etched', 'nonfoil', 'either'])],
            'any_printing' => ['sometimes', 'boolean'],
            'max_price_usd' => ['sometimes', 'nullable', 'numeric', 'decimal:0,2', 'min:0', 'max:99999999.99'],
            'any_printing_quantity' => ['sometimes', 'integer', 'min:1', 'max:4294967295'],
            'total_quantity' => ['sometimes', 'integer', 'min:1', 'max:4294967295'],
            'selected_printings' => ['sometimes', 'array'],
            'selected_printings.*.scryfall_id' => ['required', 'string', 'distinct', Rule::exists('card_printings', 'scryfall_id')],
            'selected_printings.*.quantity' => ['required', 'integer', 'min:1', 'max:4294967295'],
            'selected_printings.*.foil_preference' => ['sometimes', Rule::in(['foil', 'etched', 'nonfoil', 'either'])],
        ]);

        if (isset($validated['selected_printings'])) {
            $ids = array_column($validated['selected_printings'], 'scryfall_id');
            $matchingCount = CardPrinting::query()->whereIn('scryfall_id', $ids)
                ->where(function ($query) use ($item) {
                    $query->where('oracle_id', $item->catalog_id)
                        ->orWhere(function ($query) use ($item) {
                            $query->whereNull('oracle_id')->where('scryfall_id', $item->catalog_id);
                        });
                })->count();

            if ($matchingCount !== count($ids)) {
                throw ValidationException::withMessages([
                    'selected_printings' => 'All selected printings must match this wish list item.',
                ]);
            }
        }

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
            if (! array_key_exists('selected_printings', $validated)) {
                $item->selected_printings = [['scryfall_id' => $printing->scryfall_id, 'quantity' => 1, 'foil_preference' => $item->foil_preference]];
            }
        }

        if (array_key_exists('foil', $validated)) {
            $item->foil = $validated['foil'];
            $item->foil_preference = $validated['foil'] ? 'foil' : 'nonfoil';
        }
        if (array_key_exists('foil_preference', $validated)) {
            $item->foil_preference = $validated['foil_preference'];
            if ($validated['foil_preference'] !== 'either') {
                $item->foil = in_array($validated['foil_preference'], ['foil', 'etched'], true);
            }
        }
        if (array_key_exists('selected_printings', $validated)) {
            $oldSelections = collect($item->selected_printings ?? [])->keyBy('scryfall_id');
            $validated['selected_printings'] = array_map(function ($selection) use ($item, $oldSelections) {
                $selection['foil_preference'] ??= $oldSelections->get($selection['scryfall_id'])['foil_preference']
                    ?? $item->foil_preference;

                return $selection;
            }, $validated['selected_printings']);
        } elseif (array_key_exists('foil', $validated)) {
            $selections = $item->selected_printings;
            if ($selections !== null) {
                foreach ($selections as &$selection) {
                    $selection['foil_preference'] = $item->foil_preference;
                }
                unset($selection);
                $item->selected_printings = $selections;
            }
        }
        if (array_key_exists('total_quantity', $validated)) {
            $validated['any_printing_quantity'] = $validated['total_quantity'];
        } elseif (array_key_exists('any_printing_quantity', $validated)) {
            $validated['total_quantity'] = $validated['any_printing_quantity'];
        }
        foreach (['any_printing', 'max_price_usd', 'any_printing_quantity', 'total_quantity', 'selected_printings'] as $field) {
            if (array_key_exists($field, $validated)) {
                $item->$field = $validated[$field];
            }
        }

        $item->save();

        $item->load('printing');
        app(WishListPreviewPrintings::class)->addTo(new Collection([$item]));

        return response()->json(['data' => $item]);
    }

    public function destroy(Request $request, int $wishList, ?int $wishListItem = null): JsonResponse
    {
        $item = $this->list($request, $wishListItem === null ? null : $wishList)
            ->items()->findOrFail($wishListItem ?? $wishList);
        $item->delete();

        return response()->json(status: 204);
    }
}
