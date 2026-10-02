<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CardPrinting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CardCatalogController extends Controller
{
    public function search(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['required', 'string', 'min:1', 'max:100'],
        ]);

        $cards = CardPrinting::query()
            ->selectRaw('COALESCE(oracle_id, scryfall_id) AS catalog_id, oracle_id, MIN(name) AS name')
            ->where('name', 'like', '%'.$validated['q'].'%')
            ->groupByRaw('COALESCE(oracle_id, scryfall_id), oracle_id')
            ->orderBy('name')
            ->limit(20)
            ->get();

        return response()->json(['data' => $cards]);
    }

    public function printings(string $catalogId): JsonResponse
    {
        $printings = CardPrinting::query()
            ->whereRaw('COALESCE(oracle_id, scryfall_id) = ?', [$catalogId])
            ->orderByDesc('released_at')
            ->orderBy('name')
            ->get([
                'scryfall_id',
                'oracle_id',
                'name',
                'set_code',
                'set_name',
                'collector_number',
                'released_at',
                'lang',
                'tcgplayer_id',
                'image_uris',
                'card_faces',
                'finishes',
            ]);

        return response()->json(['data' => $printings]);
    }
}
