<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CardPrinting;
use App\Models\WishList;
use App\Models\WishListItem;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WishListController extends Controller
{
    /** @param Collection<int, WishListItem> $items */
    private function addPreviewPrintings(Collection $items): void
    {
        $ids = $items->flatMap(function (WishListItem $item) {
            if ($item->any_printing) {
                return [];
            }

            return array_column(array_slice($item->selected_printings ?? [
                ['scryfall_id' => $item->scryfall_id],
            ], 0, 5), 'scryfall_id');
        })->unique()->values();

        $printings = $ids->chunk(500)->flatMap(fn ($chunk) => CardPrinting::query()
            ->whereIn('scryfall_id', $chunk)
            ->get(['scryfall_id', 'name', 'image_uris', 'card_faces']))->keyBy('scryfall_id');

        foreach ($items as $item) {
            if ($item->any_printing) {
                $preview = CardPrinting::query()
                    ->where(function ($query) use ($item) {
                        $query->where('oracle_id', $item->catalog_id)
                            ->orWhere(function ($query) use ($item) {
                                $query->whereNull('oracle_id')->where('scryfall_id', $item->catalog_id);
                            });
                    })
                    ->orderByDesc('released_at')->orderBy('name')->orderBy('scryfall_id')
                    ->limit(5)->get(['scryfall_id', 'name', 'image_uris', 'card_faces']);
            } else {
                $selectionIds = array_column(array_slice($item->selected_printings ?? [
                    ['scryfall_id' => $item->scryfall_id],
                ], 0, 5), 'scryfall_id');
                $preview = collect($selectionIds)->map(fn ($id) => $printings->get($id))->filter()->values();
            }
            $item->setAttribute('preview_printings', $preview);
        }
    }

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
        $this->addPreviewPrintings($items);

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

        $item->load('printing');
        $this->addPreviewPrintings(new Collection([$item]));

        return response()->json(['data' => $item], 201);
    }

    public function update(Request $request, int $wishList, ?int $wishListItem = null): JsonResponse
    {
        $item = $this->list($request, $wishListItem === null ? null : $wishList)
            ->items()->findOrFail($wishListItem ?? $wishList);

        $validated = $request->validate([
            'scryfall_id' => ['sometimes', 'string', Rule::exists('card_printings', 'scryfall_id')],
            'foil' => ['sometimes', 'boolean'],
            'foil_preference' => ['sometimes', Rule::in(['foil', 'nonfoil', 'either'])],
            'any_printing' => ['sometimes', 'boolean'],
            'max_price_usd' => ['sometimes', 'nullable', 'numeric', 'decimal:0,2', 'min:0', 'max:99999999.99'],
            'any_printing_quantity' => ['sometimes', 'integer', 'min:1', 'max:4294967295'],
            'selected_printings' => ['sometimes', 'array'],
            'selected_printings.*.scryfall_id' => ['required', 'string', 'distinct', Rule::exists('card_printings', 'scryfall_id')],
            'selected_printings.*.quantity' => ['required', 'integer', 'min:1', 'max:4294967295'],
            'selected_printings.*.foil_preference' => ['sometimes', Rule::in(['foil', 'nonfoil', 'either'])],
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
                $item->foil = $validated['foil_preference'] === 'foil';
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
        foreach (['any_printing', 'max_price_usd', 'any_printing_quantity', 'selected_printings'] as $field) {
            if (array_key_exists($field, $validated)) {
                $item->$field = $validated[$field];
            }
        }

        $item->save();

        $item->load('printing');
        $this->addPreviewPrintings(new Collection([$item]));

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
