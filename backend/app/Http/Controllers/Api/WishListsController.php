<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class WishListsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->wishLists()->orderBy('id')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate(['name' => ['required', 'string', 'max:255']]);
        $name = trim($validated['name']);
        if ($this->normalize($name) === '') {
            throw ValidationException::withMessages(['name' => 'The list name must contain a letter or number.']);
        }

        return response()->json(['data' => $request->user()->wishLists()->create(['name' => $name])], 201);
    }

    public function update(Request $request, int $wishList): JsonResponse
    {
        $list = $request->user()->wishLists()->findOrFail($wishList);
        $validated = $request->validate(['notify_me' => ['required', 'boolean']]);
        $list->update($validated);

        return response()->json(['data' => $list]);
    }

    public function destroy(Request $request, int $wishList): JsonResponse
    {
        $list = $request->user()->wishLists()->findOrFail($wishList);
        $validated = $request->validate(['name' => ['required', 'string', 'max:255']]);
        if ($this->normalize($validated['name']) !== $this->normalize($list->name)) {
            throw ValidationException::withMessages(['name' => 'The list name does not match.']);
        }
        $list->delete();

        return response()->json(status: 204);
    }

    private function normalize(string $name): string
    {
        return mb_convert_case(preg_replace('/[^\p{L}\p{N}]+/u', '', $name), MB_CASE_FOLD, 'UTF-8');
    }
}
