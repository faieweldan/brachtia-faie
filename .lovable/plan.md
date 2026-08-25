# "Where you'll be" location section

Replace the sidebar "What's nearby" list on each residence page with a richer, full-width **Where you'll be** section modelled on the reference: a map at the top, then two columns of collapsible lists with distances and travel times.

## What the student sees

```text
Where you'll be
+-------------------------------------------------+
|                  MAP (interactive)              |
|          pin on residence + numbered POIs       |
+-------------------------------------------------+
 Nearby universities        ^     Points of interest      ^
 -------------------------        -------------------------
 [icon] Multimedia Uni   0.9 km   (1) D'Pulze Mall     1.2 km
   walk 12m  bike 4m  bus 5m       walk 15m bike 5m bus 6m
 [icon] HW University    2.1 km   (2) Tamarind Square  1.6 km
   walk 26m  bike 8m  bus 9m       walk 20m bike 6m bus 7m
```

- Section sits below "Inside Your Apartment" in the main column (full width), not in the sidebar.
- Each column header has a minimal chevron toggle; lists show the first 3 items and expand for the rest.
- Universities get a graduation-cap badge in brand green; points of interest get numbered badges matching the map markers.
- Each row: name, distance on the right, and a compact row of walk / bike / bus times with small icons.
- "Open in Waze" button stays, moved under the map.
- Mobile: map on top, the two lists stack in one column.

## Data

Extend each property in `src/data/properties.ts`:

- `coords: { lat, lng }` for the residence pin.
- `nearbyUniversities: { name, distance, walk, bike, transit }[]` — MMU Cyberjaya, Heriot-Watt Malaysia, Limkokwing, University of Cyberjaya.
- `pointsOfInterest: { name, distance, walk, bike, transit }[]` — D'Pulze Mall, Tamarind Square, MRT Cyberjaya City Centre, 24-hour clinic, mini market, recreation park.

These come from the existing `nearbyCyberjaya` copy, rewritten as structured rows with realistic sample distances/times. The old flat `nearby` array is removed once nothing references it.

## Technical notes

- Map: embedded OpenStreetMap iframe (`https://www.openstreetmap.org/export/embed.html?bbox=...&marker=lat,lng`) — no API key, no new dependency, works in SSR. If you later want custom numbered markers on the map itself, that needs a client-only Leaflet component; the iframe version ships now with numbered badges in the list only.
- New component `src/components/site/LocationSection.tsx` holding the map, the two collapsible columns and the Waze button; the route just passes the property.
- Collapse behaviour reuses the same pattern as `AmenitySection` (local `useState`, chevron button).
- Edits: `src/data/properties.ts`, `src/routes/properties.$slug.index.tsx`, new `LocationSection.tsx`.
