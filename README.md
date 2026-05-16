# proto-makesend-shared

Canonical Firestore type definitions shared between MAKESEND prototype apps.

## Consumed by

- [`proto-makesend-driver-input`](https://github.com/AnanAIRPORTELs/proto-makesend-driver-input) — driver PWA, writes `daily_contributions`
- [`proto-makesend-fleet-payroll`](https://github.com/AnanAIRPORTELs/proto-makesend-fleet-payroll) — admin/COO review, reads `daily_contributions`

## How it works

Each consumer repo includes this as a git submodule at `shared/`:

```bash
git submodule add https://github.com/AnanAIRPORTELs/proto-makesend-shared.git shared
```

TypeScript files import via `@/shared/contribution-types` (alias mapped in `tsconfig.json`).

## Change workflow — "automatic notice" pattern

When the Firestore doc shape changes:

1. **Bump types here.** Add fields. Bump `CURRENT_SCHEMA_VERSION` if it's a breaking change.
2. **Commit + push** this repo.
3. **In each consumer repo:** `cd shared && git pull` then commit the bumped submodule pointer.
4. **`pnpm exec tsc --noEmit` fails** in the consumer until the new shape is handled. This is the safety net — the build will not pass with stale assumptions.
5. For multi-version compatibility, branch on `isV2(doc)` (or a future `isV3`) rather than forcing migration.

## Files

| File | Purpose |
|---|---|
| `contribution-types.ts` | `DailyContributionDoc`, v1/v2 shape unions, type guards |

## Versioning

Schema versions are integers on the doc itself (`schemaVersion: 1 | 2 | ...`). New shapes get a new version. Old docs without `schemaVersion` are treated as v1. Consumers MUST handle all versions until a migration sweeps old docs (none planned for the prototype phase).
