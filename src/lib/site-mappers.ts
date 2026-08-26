import type { Property, RoomType } from "@/data/properties";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function rowToProperty(row: any): Property {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    location: row.location ?? "",
    tagline: row.tagline ?? "",
    summary: row.summary ?? "",
    description: row.description ?? [],
    heroImage: row.hero_image ?? "",
    gallery: row.gallery ?? [],
    buildingFacilities: row.building_facilities ?? [],
    includedInStay: row.included_in_stay ?? [],
    utilitiesNote: row.utilities_note ?? "",
    insideApartment: row.inside_apartment ?? [],
    apartmentFootnote: row.apartment_footnote ?? undefined,
    coords: row.coords ?? { lat: 0, lng: 0 },
    nearbyUniversities: row.nearby_universities ?? [],
    pointsOfInterest: row.points_of_interest ?? [],
    terms: row.terms ?? [],
    contractTerms: row.contract_terms ?? ["long"],
    singleBedOptions: row.single_bed_options ?? [],
    paymentCycle: row.payment_cycle ?? "",
    feeConfig: row.fee_config ?? {},
    pricing: row.pricing ?? { long: [], short: [] },
    wazeUrl: row.waze_url ?? "",
  };
}

export function rowToRoomType(row: any, propertySlug: string): RoomType {
  return {
    id: row.code,
    propertySlug,
    tag: row.tag ?? "",
    roomCode: row.room_code ?? "",
    name: row.name,
    unitType: row.unit_type ?? "",
    description: row.description ?? "",
    sizeSqft: row.size_sqft ?? undefined,
    sizeLabel: row.size_label ?? undefined,
    bathroom: row.bathroom ?? "shared",
    hasView: !!row.has_view,
    viewType: row.view_type ?? undefined,
    publicVisible: row.public_visible !== false,
    image: row.image ?? "",
    gallery: row.gallery ?? [],
    features: row.features ?? [],
    occupancies: row.occupancies ?? ["single"],
    rent: row.rent ?? { long: { single: null, twin: null }, short: { single: null, twin: null } },
    availableFrom: row.available_from ?? "",
    status: row.status ?? "available",
    spotsLeft: row.spots_left ?? undefined,
    beds: row.beds ?? {},
    furnishing: row.furnishing ?? [],
  };
}

export function propertyToRow(p: Property) {
  return {
    slug: p.slug,
    name: p.name,
    location: p.location,
    tagline: p.tagline,
    summary: p.summary,
    description: p.description,
    hero_image: p.heroImage,
    gallery: p.gallery,
    building_facilities: p.buildingFacilities,
    included_in_stay: p.includedInStay,
    utilities_note: p.utilitiesNote,
    inside_apartment: p.insideApartment,
    apartment_footnote: p.apartmentFootnote ?? null,
    coords: p.coords,
    nearby_universities: p.nearbyUniversities,
    points_of_interest: p.pointsOfInterest,
    terms: p.terms,
    contract_terms: p.contractTerms,
    single_bed_options: p.singleBedOptions ?? [],
    payment_cycle: p.paymentCycle,
    fee_config: p.feeConfig,
    pricing: p.pricing,
    waze_url: p.wazeUrl,
    updated_at: new Date().toISOString(),
  };
}

export function roomTypeToRow(r: RoomType, residenceId: string, sortOrder: number) {
  return {
    residence_id: residenceId,
    code: r.id,
    tag: r.tag,
    room_code: r.roomCode,
    name: r.name,
    unit_type: r.unitType,
    description: r.description,
    size_sqft: r.sizeSqft ?? null,
    size_label: r.sizeLabel ?? null,
    bathroom: r.bathroom,
    has_view: r.hasView,
    view_type: r.viewType ?? null,
    public_visible: r.publicVisible,
    image: r.image,
    gallery: r.gallery,
    features: r.features,
    occupancies: r.occupancies,
    rent: r.rent,
    available_from: r.availableFrom || null,
    status: r.status,
    spots_left: r.spotsLeft ?? null,
    beds: r.beds ?? {},
    furnishing: r.furnishing ?? [],
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  };
}
