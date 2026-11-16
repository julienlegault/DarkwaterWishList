<?php

namespace App\Services;

use App\Models\CardPrinting;
use App\Models\WishListItem;
use Illuminate\Database\Eloquent\Collection;

class WishListPreviewPrintings
{
    /** @param Collection<int, WishListItem> $items */
    public function addTo(Collection $items): void
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
}
