// Canonical Firestore doc shapes for MAKESEND `daily_contributions`.
//
// This file is the **source of truth** consumed by both:
//   - proto-makesend-driver-input (writes via /api/submit)
//   - proto-makesend-fleet-payroll (reads via admin review queue)
//
// Wired into each repo as a git submodule at `shared/`. Bump this repo's
// commit, then bump the submodule pointer in both consumer repos. Their
// TypeScript builds fail until they handle the new shape — the whole
// point of "automatic notice".

/** Doc shape version. Bump when adding/removing/renaming top-level fields. */
export type SchemaVersion = 1 | 2;
export const CURRENT_SCHEMA_VERSION: SchemaVersion = 2;

// ─── v2 (4-photo odometer model, 2026-05-16+) ─────────────────────────────

export interface OdometerPhotoMeta {
  takenAt: string | null; // ISO timestamp from photo EXIF
  lat: number | null; // EXIF GPS
  lng: number | null;
}

export interface OdometerReadingV2 {
  km: number | null;
  confidence: "high" | "medium" | "low";
  note: string;
  rawText: string;
}

export interface AiVisionParseV2 {
  readings: {
    home?: OdometerReadingV2;
    hub?: OdometerReadingV2;
    firstDp?: OdometerReadingV2;
    lastDp?: OdometerReadingV2;
  };
}

export interface DriverConfirmedV2 {
  homeKm: number | null;
  hubKm: number | null;
  firstDpKm: number | null;
  lastDpKm: number | null;
  distance: number; // PU + DP total
  // The next 3 are written by /api/submit but kept optional here so consumer
  // code reading older v2 docs (or partial test data) doesn't have to assert.
  distancePuKm?: number;
  distanceDpKm?: number;
  distancePersonalKm?: number; // 0 in v2 (kept for engine compat)
}

export interface MileagePhotosV2 {
  homeUrl: string | null;
  hubUrl: string | null;
  firstDpUrl: string | null;
  lastDpUrl: string | null;
}

export interface DispatchSpeed {
  avgKmh: number;
  durationMinutes: number;
  distanceKm: number;
}

// ─── v1 (legacy 2-photo, pre 2026-05-16) ──────────────────────────────────

export interface AiVisionParseV1 {
  startKm: number | null;
  endKm: number | null;
  distance: number | null;
  confidence?: "high" | "medium" | "low";
  note?: string;
  rawText?: string;
}

export interface DriverConfirmedV1 {
  startKm: number | null;
  endKm: number | null;
  distance: number;
  distancePuKm?: number;
  distanceDpKm?: number;
  distancePersonalKm?: number;
}

export interface MileagePhotosV1 {
  startUrl: string | null;
  endUrl: string | null;
}

// ─── Union (consumers branch on schemaVersion) ────────────────────────────

/** Read-side shape — consumer repos receive this from Firestore.
 *  Optional fields exist because old docs may pre-date v2. Use `isV2()` to
 *  branch UI; never assume a field exists without checking. */
export interface DailyContributionDoc {
  contributionId: string;
  driverId: string;
  vehicleId: string;
  hub: string;
  cycleId: string;
  schemaVersion?: SchemaVersion;

  // Distance + points
  totalDistance: number;
  pickupPoints?: number;
  deliveryPoints?: number;
  distancePuKm: number;
  distanceDpKm: number;
  distancePersonalKm?: number;

  // v1 OR v2 — branch via isV2(doc)
  driverConfirmed?: DriverConfirmedV1 | DriverConfirmedV2;
  aiVisionParse?: AiVisionParseV1 | AiVisionParseV2 | null;
  mileagePhotos?: MileagePhotosV1 | MileagePhotosV2;

  // v2-only
  odometerMeta?: {
    home: OdometerPhotoMeta;
    hub: OdometerPhotoMeta;
    firstDp: OdometerPhotoMeta;
    lastDp: OdometerPhotoMeta;
  };
  backHomeKm?: number | null;
  dispatchSpeed?: DispatchSpeed | null;

  // Misc
  supportingPhotoUrl?: string | null;
  note?: string | null;

  // HITL audit trail
  submittedBy?: "driver" | "admin";
  submittedByUid?: string | null;
  needsAdminReview?: boolean;
  adminApproved?: boolean;
  status?: string;
}

// ─── Type guards ──────────────────────────────────────────────────────────

// Input shape is intentionally loose — consumer Contrib types vary slightly
// between repos. The fields we actually read are stable.
export interface IsV2Input {
  schemaVersion?: SchemaVersion;
  driverConfirmed?: {
    homeKm?: number | null;
    hubKm?: number | null;
    firstDpKm?: number | null;
    lastDpKm?: number | null;
  };
  mileagePhotos?: {
    homeUrl?: string | null;
    hubUrl?: string | null;
    firstDpUrl?: string | null;
    lastDpUrl?: string | null;
  };
}

export function isV2(doc: IsV2Input): boolean {
  if (doc.schemaVersion === 2) return true;
  const dc = doc.driverConfirmed;
  if (
    dc?.homeKm != null ||
    dc?.hubKm != null ||
    dc?.firstDpKm != null ||
    dc?.lastDpKm != null
  )
    return true;
  const m = doc.mileagePhotos;
  if (m?.homeUrl || m?.hubUrl || m?.firstDpUrl || m?.lastDpUrl) return true;
  return false;
}
