---
name: api-processor-using
description: Use when consuming the api-processor library from another TypeScript project — building, comparing (changelog), or exporting a package version with PackageVersionBuilder, reading the notifications and hasErrors flags it returns, or importing its shared types, constants, and utilities.
---

# Using api-processor

api-processor turns API source specifications (REST/OpenAPI, GraphQL, AsyncAPI, MCP,
DDL, text) into a package-version build result. Its public API is split across two
entries; which one you import decides whether you pull in the DDL parser's ~1.1 MB WASM.

## Two entry points: the light root and `/processor`

- **`@netcracker/qubership-apihub-api-processor`** — the **light** surface: shared
  types, constants and api-type ids (`BUILD_TYPE`, `REST_API_TYPE`,
  `VERSION_VALIDATION_LEVEL`, `VERSION_STATUS`, `ShareabilityStatus`,
  `VersionsComparison`, …) and pure utilities (`calculateNormalizedRestOperationId`,
  `calculateDdlEntityId`, compare-summary helpers, …). It is parser-free — safe to
  import from anywhere, including main-thread / UI code.
- **`@netcracker/qubership-apihub-api-processor/processor`** — the **engine**:
  `PackageVersionBuilder` plus the build strategy and the compare/build machinery.
  It transitively imports `@netcracker/qubership-apihub-ddlapi/parser`, so importing
  it pulls the DDL parser (libpg-query WASM). Import it **only** where spec
  processing actually runs.

```typescript
// shared types / constants / utils — from the light root
import { BUILD_TYPE, VERSION_VALIDATION_LEVEL, type VersionsComparison } from '@netcracker/qubership-apihub-api-processor'
// the build engine — from /processor
import { PackageVersionBuilder } from '@netcracker/qubership-apihub-api-processor/processor'
```

The light root re-exports every type the engine returns (e.g. `VersionsComparison`,
`BuilderResolvers`, `FileId`), so a consumer can type its calls without importing
`/processor` anywhere but the module that actually runs the build.

## A build reports its problems instead of failing on them

A document that cannot be built does not cost the version the documents that built
cleanly: the build keeps going, the problem becomes a notification, and the version
publishes marked.

`NotificationMessage` is `{ category, severity, message, documentId? }`:

- `category` is a stable id for the check that produced the message (`ref-not-found`,
  `ddl-duplicate-object`, …). Filter on it — never on the interpolated `message`.
- `documentId` is the document's **slug**, never its `fileId` and never a path. It is
  absent when the problem belongs to no single document.
- One problem spanning several documents arrives as several messages, one per
  document. A duplicate operation id shared by two documents produces two.

There are two notification streams, and they belong to different things:

- `buildResult.notifications` is the build's own stream. It ships as
  `notifications.json`.
- Each comparison carries its own `notifications`, which ship as
  `comparison-notifications.json` grouped by version pair. A comparison the host
  served from its cache was not calculated here, so it ships **no row at all** —
  an empty row would wipe the messages stored by the build that did calculate it.

Three separate `hasErrors` flags, each derived from one of those streams:

| Flag | Where | True when |
|------|-------|-----------|
| version | `info.json` | any build notification has `severity === Error` |
| document | its entry in `documents.json` | an `Error` names that document's slug |
| comparison | its entry in `comparisons.json` | its own notifications carry an `Error` |

A cached comparison is the exception: it was not calculated here, so its flag comes from the resolver
untouched rather than being derived. Each flag is written only when true, so read it as optional and default
it to `false`.

## A release build throws where a draft publishes

Status decides what an `Error` costs when a version is published. A `draft` publishes
whatever it found, marked. A `release` **throws** instead of returning a result if any
`Error` was reported on either stream, with a message naming the documents involved.
The check runs again once the archive is assembled, so the rejection can arrive at the
very end. Handle it — for a release over broken sources this is the outcome, not a
defect.

The handful of problems that abort any build regardless of status are the ones with
nothing to publish or nothing to trace afterwards: an invalid build config (a
changelog with no `previousVersion` included), a packaging failure, a missing host
resolver, an api-processor version mismatch between the two versions being compared,
an internal inconsistency in the comparison itself, and a DDL comparison with no
compare hook registered. A dashboard changelog also
aborts when one of its references compared with errors, because the aggregate has no
correct part.

## Errored documents ship as stubs

A document that failed to build is still published: it appears in `documents.json`
with its original source bytes and is downloadable. What it lacks is parsed content —
`operationIds` is empty, and it contributes no operations, entities, or comparisons.

## Keep `PackageVersionBuilder` off the main thread

`PackageVersionBuilder` is the only reason to import `/processor`, and it drags in the
DDL parser + WASM. In a browser app, run it in a **Web Worker**, never the main bundle:

- The worker module imports `PackageVersionBuilder` from `/processor`; everything on
  the main thread imports only the light root, which confines the WASM to the worker
  chunk.
- Instantiate the worker **lazily** — create it on the first publish / changelog /
  export, not at app load — so the worker chunk (and the WASM it loads on the first
  DDL parse) is fetched only when processing actually happens.
- ddlapi's browser `/parser` build is self-contained (WASM inlined), so **no
  bundler WASM plugins are needed**. Just keep ddlapi out of esbuild pre-bundling
  (`optimizeDeps.exclude: ['@netcracker/qubership-apihub-ddlapi']`) so it stays a
  lazily-loaded chunk.

In Node, import `/processor` directly (CJS `require` resolves the externalized
parser, which reads its WASM from `node_modules` via `fs`) — no plumbing required.

## Never import the engine from main-thread or shared code

Importing `PackageVersionBuilder` — or anything from `/processor` — into a module
that runs on the main thread puts the parser/WASM back into the main bundle. The
types, constants, and utilities you need there all live on the light root. Enforce
it with an ESLint `@typescript-eslint/no-restricted-imports` rule that forbids
`/processor` (and `ddlapi/parser`) outside the designated worker / engine files.
