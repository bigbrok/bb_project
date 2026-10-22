"use client";

import { useState, type FormEvent } from "react";
import { SearchIcon } from "lucide-react";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

export type FoundPlace = { lat: number; lng: number };

/**
 * Looks up a place name or address only when the user submits, as the
 * Nominatim usage policy forbids searching while typing.
 */
export function PlaceSearchForm({
  onFound,
}: {
  onFound: (place: FoundPlace, query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (!text || pending) return;

    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?${new URLSearchParams({ q: text })}`);
      if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
      const { place } = (await res.json()) as { place: FoundPlace | null };
      if (place) onFound({ lat: place.lat, lng: place.lng }, text);
      else setError(`'${text}' 위치를 찾지 못했습니다.`);
    } catch {
      setError("장소를 검색하지 못했습니다. 잠시 후 다시 조회해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="place-search" className="sr-only">
          장소 검색
        </FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            id="place-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="장소 이름이나 주소 (예: 강남역)"
            aria-invalid={error ? true : undefined}
            autoComplete="off"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              variant="secondary"
              size="sm"
              disabled={!query.trim() || pending}
            >
              조회
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {error && <FieldError>{error}</FieldError>}
      </Field>
    </form>
  );
}
