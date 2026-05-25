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
export type SchemaVersion = 1 | 2 | 3;
export const CURRENT_SCHEMA_VERSION: SchemaVersion = 3;

// ─── Job sheet cross-check (DP, 2026-05-23+) ──────────────────────────────

/** How a driver-input photo group was resolved against the planning sheet. */
export type JobMatchSource =
  | "auto" // System picked nearest job by proximity
  | "manual" // Driver explicitly picked from dropdown
  | "missing_confirmed" // Driver confirmed "job in sheet but no photo"
  | "not_a_job"; // Driver flagged group as non-delivery stop

export interface JobMatch {
  /** Photo group ID (driver-input ProofGroup.groupId). null when no group. */
  groupId: number | null;
  /** Sheet booking ID. null for not_a_job. */
  bookingId: string | null;
  /** Decision source. */
  source: JobMatchSource;
  /** Haversine distance between centroids in meters. null when unmeasurable. */
  distM: number | null;
  /** True if matched pair's postcodes disagree (warn, don't block). */
  postcodeMismatch?: boolean;
  /** Free text for missing_confirmed / not_a_job. */
  reason?: string | null;
}

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

/**
 * Driver dispatch performance — time per delivery point.
 *
 * Per Khun Ho 2026-05-18: the relevant metric is minutes spent per
 * delivery between firstDp.takenAt and lastDp.takenAt, not km/h. Lower
 * is better. Computed only when both photos have EXIF timestamps and
 * deliveryCount > 0; null otherwise.
 *
 *   minutesPerDelivery = durationMinutes / deliveryCount
 *
 * durationMinutes is the wall-clock interval between the firstDp and
 * lastDp odometer photo timestamps. deliveryCount is the driver-entered
 * jobDp (delivery points) on that contribution.
 */
export interface DispatchSpeed {
  minutesPerDelivery: number;
  durationMinutes: number;
  deliveryCount: number;
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

  // v3-only (2026-05-18+): proof-photo audit splits into a Pickup leg and a
  // Dispatch leg. Each is a MileageAuditResult shape — defined in the
  // driver-input/fleet-payroll repos (not re-typed here to keep this shared
  // module free of audit-engine details). The legacy `mileageAudit` is kept
  // for v2-only callers and is populated with the pickup leg on v3.
  mileageAuditPickup?: unknown | null;
  mileageAuditDispatch?: unknown | null;

  // 2026-05-23 — Job sheet cross-check. Per-group decision about which
  // planning-sheet booking the group represents, OR a driver confirmation
  // that a job had no photo / a group was a non-delivery stop. DP shipped
  // first, PU added same day after Khun Ho confirmed DP works.
  //
  // Driver-input wrote these at submit time until 2026-05-25 — see
  // adminJobMatches{,Pu} below for the new admin-resolved variant after the
  // architecture move.
  jobMatches?: JobMatch[]; // DP leg (legacy / driver-side)
  jobMatchesPu?: JobMatch[]; // PU leg (legacy / driver-side)

  // 2026-05-25 — Admin-side audit (Khun Ho's architecture move: HITL +
  // matching moved off driver-input). Fleet-payroll review recomputes
  // photo groups from raw proofPhotos and the admin resolves any
  // mismatches against the planning sheet. Persisted here so the audit
  // survives reviewer changes and the payroll engine has a single source
  // of truth.
  adminJobMatches?: JobMatch[]; // DP leg (admin-resolved)
  adminJobMatchesPu?: JobMatch[]; // PU leg (admin-resolved)

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
  if (doc.schemaVersion === 2 || doc.schemaVersion === 3) return true;
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

export interface IsV3Input {
  schemaVersion?: SchemaVersion;
  mileageAuditPickup?: unknown | null;
  mileageAuditDispatch?: unknown | null;
}

/** True when the doc has the v3 split Pickup/Dispatch audit fields. v3 docs
 *  also satisfy isV2() — v3 is a superset, not a replacement. */
export function isV3(doc: IsV3Input): boolean {
  if (doc.schemaVersion === 3) return true;
  if (doc.mileageAuditPickup != null || doc.mileageAuditDispatch != null) {
    return true;
  }
  return false;
}
