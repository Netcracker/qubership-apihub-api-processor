# Tolerant Publication: Per-Document Errors

Status: **Draft for review** · 2026-07-24

Today a `build` (publication) in api-processor fails entirely when processing of a single document throws.
This design makes publication tolerant: errors are caught per document, collected as notifications, associated
with the document(s), and — for `draft` publications — the version is still published and carries an error mark.
A `release` publication still fails, but reports the specific errors that blocked it.

The `changelog` build type is affected too: a changelog calculation may complete even when the version it
describes has errors, but a version with errors may not serve as the *previous* version of a comparison.

## Why

**To allow publishing draft versions for troubleshooting.** A failure in one document currently costs the user
the whole version, including the parts that built perfectly. For example: the AsyncAPI specifications in a
version have a problem, but the REST specifications are fine. Today nothing is published, so nobody can look at
anything. With this change the version publishes as a `draft`: the REST operations are browsable and reviewable
while the AsyncAPI errors are analyzed and fixed, and the version carries a visible error mark plus per-document
error details pointing at what to fix.

This is a diagnostic affordance, not a relaxation of quality gates — `release` publication stays strict.

## Scope and governing rules

Two build types are in scope: **`build`** (version publication — the tolerant path) and **`changelog`**
(comparison calculation — its own rule below). The transform and export build types raise no notifications at
all and are unaffected; see [§2a](#2a-reachability-by-build-type).

Governing rules after the latest decisions:

- **No automatic status downgrade.** Publishing in `release` status while any `Error`-severity notification
  exists is a **fatal** error (publication fails). Publishing in `draft` status succeeds and the version is
  marked as having errors.
- **`release-candidate` is unused** — disregarded everywhere below.
- **Changelog build** is allowed to complete even when the *current* version has `Error` notifications, but a
  version with errors **must not be usable as the previous version** in a changelog calculation.
- **Dashboards:** a package version with errors **cannot be added** to a dashboard. If a dashboard somehow
  already references an errored version, the UI must indicate it when viewing the dashboard's packages.
- An `Error`-severity notification is what "critical" meant in the previous draft — the terms are unified: for
  this story, **severity `Error` is the blocking condition** for `release` publication.

UI implementation is **out of scope**; UI source was analyzed only to identify the backend APIs that change.

## High-level design

1. **Publication becomes tolerant per document.** A failure while processing one document no longer aborts the
   build. It is recorded against that document, the document is still published (as an empty placeholder that
   exposes no operations or entities), and every other document builds and publishes normally.
2. **Notifications are the single reporting mechanism.** Failures that used to abort the build become
   notifications. Each message carries a *category* and is attributed to the document or documents it concerns.
3. **`Error` severity is the blocking condition.** A `draft` version publishes with errors and is marked. A
   `release` version does not publish at all — the build fails and reports what is wrong.
4. **Two summary flags describe the outcome.** api-processor computes `hasErrors` for the version and for each
   document, and carries both in the build result. The backend stores them and derives a third view: which API
   types and contract types contain errored documents.
5. **A small set of failures stays fatal**, for two distinct reasons: nothing publishable survives them (there
   is no version, or no artifact), or publishing degraded output would hide a defect that is hard to diagnose
   afterwards.
6. **Errored versions are quarantined from composition.** A version with errors cannot serve as the baseline of
   a changelog calculation, and cannot be referenced by a dashboard.
7. **Some errors belong to the version, not to a document** (a missing previous version, unresolvable
   references). These mark the version without marking any document, and are reachable through a new
   notifications endpoint.

## Public API changes at a glance

Detail in [api-processor](#api-processor) and [Backend](#backend); this is the summary of what consumers see.

**api-processor — library contract**

| Item | Change |
|------|--------|
| `NotificationMessage` | `fileId` → `documentId` (a single document slug); new required `category`; `operationId` / `previousOperationId` removed. A problem concerning several documents yields one message per document. |
| `documents.json` — each document | new optional `hasErrors` (default `false`) |
| `info.json` — the version | new optional `hasErrors` (default `false`) |
| `notifications.json` | unchanged location; entries follow the new `NotificationMessage` shape |

**Backend — REST API**

| Endpoint | Change |
|----------|--------|
| `GET /api/v3/packages/{packageId}/versions` | `hasErrors` per version |
| `GET /api/v3/packages/{packageId}/versions/{version}` | `hasErrors` for the version; `hasErrors` per `operationTypes` entry and per `contractsSummary.ddl` / `.mcp` |
| `GET /api/v2/packages/{packageId}/versions/{version}/documents` | `hasErrors` per document |
| `GET /api/v3/packages/{packageId}/versions/{version}/documents/{slug}` | `hasErrors` for the document |
| **new** `GET /api/v2/packages/{packageId}/versions/{version}/notifications` | version's build notifications, filterable by `documentId`, `severity`, `category` |

**Backend — new refusals**

Publishing a `release` version that has errors; using a version with errors as the previous version of a
changelog; and referencing a version with errors from a dashboard.

All added response fields are optional and default to `false`, so existing clients are unaffected.

## Error catalogue (api-processor, `build` path)

The publication path is `PackageVersionBuilder.run()` → `BuildStrategy.execute()`:
`validateConfig` → `buildFiles` (parse + build document per file) → per-document processing loop
(operations / MCP / DDL) → whole-set MCP validations → deprecated history → `compareVersions` (changelog) →
`createVersionPackage` (zip). Any uncaught throw currently fails the whole publication.

The work splits every failure into: **(a)** already-a-notification (keep, but review severity + assign
category), or **(b)** an uncaught throw to be converted into an `Error` notification attributed to the
document(s), leaving the document present but empty.

**The primary test for keeping a failure fatal is whether anything publishable survives it** — not whether it
can be attributed to a document. If a partial version would still give the user something worth looking at, the
failure becomes a notification and the draft publishes. Attribution is a separate concern: some failures that
cannot be pinned to a single document (a duplicate spanning two documents, a whole-set MCP check) are still
tolerated, because the rest of the version survives them.

Two reasons keep a failure fatal:

- **Nothing to salvage** (Group C) — no version can be constructed, or no artifact is produced at all.
- **Deliberate design decision** (Group D) — a partial version *could* be published, but doing so would mask a
  defect that is hard to diagnose later. Publishing degraded output would defer the problem to whoever
  eventually notices the data is wrong, long after the cause is traceable.

### Group A — document-attributable, single document (throws → convert to notification)

| # | Source | Failure | documentId |
|---|--------|---------|------------|
| A1 | `builder.ts:764` `parseFile` | `Cannot parse file <fileId>` — parser threw (e.g. `async.parser.ts:78/170`) | file's slug |
| A2 | `components/document.ts:74` `buildDocument` | `Cannot process the "<fileId>" document` — wraps every `apiBuilder.buildDocument` throw | slug |
| A2a | `apitypes/rest/rest.document.ts:84` | swagger→openapi 3.0 transform failed | via A2 |
| A2b | `utils/document.ts:166` | broken `$ref` (`REF_NOT_FOUND`/`REF_NOT_VALID_FORMAT`) when `brokenRefs=error` | via A2 |
| A2c | `apitypes/unknown/unknown.document.ts:93` | document has no source | via A2 |
| A3 | `components/operations.ts:45` `buildOperations` throws | e.g. `graphql.operation.ts:197,238`, `async.operation.ts:275,345`, `async.utils.ts:183`, `utils/operations.utils.ts:247` | slug |
| A4 | `apitypes/ddl/ddl.validation.ts:53` | DDL intra-document duplicate object | slug |
| A5 | `apitypes/ddl/ddl.entities.ts:56,66` | invalid DDL entity construction | slug |
| A6 | `apitypes/mcp/mcp.entities.ts:45,51,70` | MCP missing `mcpEndpoint` / invalid kind / intra-document duplicate | slug |
| A7 | `components/mcp.ts:144,158,164` | MCP missing endpoint / unsupported `protocolVersion` / schema non-conformance | slug |
| A8 | `components/deprecated.ts:128` | component type/name not a string | operation's document slug |

### Group B — document-attributable, multiple documents (throws → one notification per affected document)

Each of these produces **one notification per document**, all with the same message text (see §1,
denormalization).

| # | Source | Failure | Notifications emitted |
|---|--------|---------|-----------------------|
| B1 | `components/operations.ts:23` | duplicate AsyncAPI `operationId` across documents | one per document in the pair |
| B2 | `components/mcp.ts:56` | duplicate MCP entity id across documents | one per document in the pair |
| B3 | `components/ddl.ts:43` | duplicate DDL entity id across documents | one per document in the pair |
| B4 | `components/mcp.ts:110` | MCP endpoint publishes entities but has no init | one per document of the endpoint |
| B5 | `rest.operations.ts:143` `createDuplicatesError` | duplicate REST operationId within/across documents | one per affected document |

### Group C — stays fatal (nothing salvageable)

Reviewed against the "is anything publishable left?" test:

| # | Source | Failure | Why nothing survives |
|---|--------|---------|----------------------|
| C1 | `validators.ts:22` / `build.strategy.ts:56` | invalid config: no `packageId`/`version`; no files and no refs | There is no version to publish. Nothing has been built and nothing can be — the build has no subject. |
| C2 | `createVersionPackage` / zip tooling | packaging / zip failure | No artifact is produced. Even a fully-built version cannot be delivered, so there is nothing for the backend to receive. |

### Group D — stays fatal by design decision

These failures are recoverable in principle — by the time they fire the version's own documents and operations
are already built, so a partial version *could* be published. They are kept fatal deliberately, because
publishing a degraded version would mask a defect that is hard to diagnose after the fact.

| # | Source | Failure | Why fatal is deliberate |
|---|--------|---------|-------------------------|
| D1 | `builder.ts` resolver guards: `:446` `versionOperationsResolver`, `:548` `versionDocumentsResolver`, `:591` `versionDeprecatedResolver`, `:627` `versionResolver`, `:663` `versionReferencesResolver` | a resolver the host must supply is not provided | A defect in the embedding host, not in the content. It fails identically for every build, so tolerance buys nothing; degrading it would silently ship changelog-less drafts from a broken deployment forever. |
| D2 | `validators.ts:51,58` via `compare.operations.ts:68,69` | api-processor version mismatch on the previous or current resolved version | **Design decision:** a version-mismatch must not be hidden. Publishing a draft with a silently-missing or partial changelog would defer the problem to whoever later notices the data is wrong — by then the mismatch is hard to trace back. Failing the build reports the real cause at the point it occurs. |

Both are only reached for the **previous** version or the deprecated-history pass; the current version resolves
locally via `canBeResolvedLocally`. Note D2 therefore also fails a `changelog` build outright — that is
intended, and is the one exception to the "a changelog may complete with errors" rule in §5.

Distinguish D1 from `builder.ts:636` / `:682`, which fire when the resolver *is* present but returns nothing
(version or references not found). Those are already notifications today and stay that way.

`packageResolver` (`:516`, `:521`) and `templateResolver` / `rawDocumentResolver` (`:366`, `:392`, `:397`) are
reached **only from export strategies** and never during a `build`, so they are out of scope here.

### Changelog-phase throws — open

`compareVersions` internals (`rest.changes.ts:180`, `graphql.changes.ts:136`, `async.changes.ts:148`,
`compare.ddl.ts:192`) currently throw and would abort a build after all documents are built. By the salvageable
test they are candidates for conversion to notifications — the version content survives, only the comparison is
lost. They are left open because they signal an internal inconsistency (an operation present in the index but
missing from its document pair), and the D2 reasoning arguably extends to them: a silently-degraded changelog
hides a defect that is hard to trace later. Recommend resolving them the same way as D2 (keep fatal) unless the
review finds they are routine and user-caused.

## api-processor

### 1. New `NotificationMessage` shape

```ts
export interface NotificationMessage {
  category: MessageCategory
  severity: MessageSeverity
  message: string
  documentId?: string              // document slug; absent when the message is not about a document
}
```

Changes from today:

- `fileId` → `documentId` (the document **slug**, the natural/public id; `fileId` is internal).
- new required `category` (string enum, below).
- `operationId` / `previousOperationId` removed (too specific and not persisted by the backend anyway).

**Messages are denormalized by document.** `documentId` is a single optional slug, never a list. A problem
that concerns several documents at once — a duplicated operation id, an MCP endpoint missing its init —
produces **one notification per affected document**, all carrying the same `message`, `category` and
`severity`, each with its own `documentId`.

This keeps every consumer simple: `hasErrors` per document is a plain lookup, the endpoint's `documentId`
filter is a plain equality match, and the backend stores one row per notification with no splitting or array
containment. The cost is repeated message text, which is a fair trade — each copy is individually meaningful,
because a user looking at one document wants that document's problems regardless of what else the problem
touches.

**fileId→slug resolution.** Some notifications are raised where only `fileId` is known (parse-time,
pre-build). Slugs are assigned in `buildFiles` (`createFileSlugs`) before per-file build, and every built
document is in `buildResult.documents` keyed by `fileId` with `.slug`. Implementation: raise with `fileId`
internally, then normalize to `documentId` in a single pass at package-creation time using the
`fileId → document.slug` map. A file that never became a document (hard parse failure with no
`buildErrorDocument`) still gets a slug because `buildErrorDocument` is produced for the parse/build failure
cases (see catch points).

This applies only to the **file-level** sites (`files.ts`, `builder.ts:754`, `document.ts:173`,
`rest.operations.ts` path validation), which know a `fileId`. **Operation-level** sites need no normalization:
`ApiOperation.documentId` already holds the slug (see §2b).

**Open question — notification id.** Not required for this story: the new endpoint returns a filtered list and
the `(documentId, category, severity, message)` tuple is enough for the UI. Recommendation: do **not** add an
id to the api-processor shape; if the backend needs stable row identity it can add a synthetic id on persist.

### 2. `MessageCategory` string enum

Derived from analysis of every notification-creation site (current + new catch points). Proposed values:

```ts
export const MESSAGE_CATEGORY = {
  DocumentParsing: 'document-parsing',   // file could not be parsed (A1, builder.ts:754)
  DocumentBuild:   'document-build',     // buildDocument failed (A2, files.ts:60)
  OperationBuild:  'operation-build',    // buildOperations failed (A3)
  Validation:      'validation',         // spec validation (paths, mcp schema) (A6/A7, rest.operations paths)
  Duplicate:       'duplicate',          // duplicate ids across/within documents (A4, B1-B5, operations.ts:29)
  References:      'references',          // broken $ref / bundling (A2b, document.ts:173)
  Changelog:       'changelog',          // comparison / risky / deprecated-hash (rest.changes, deprecated.ts)
  Resolution:      'resolution',         // version/document/data resolution (builder.ts warnings + :636,:682)
  Mcp:             'mcp',                 // MCP capability cross-check (mcp.ts:196) and MCP-specific issues
  Packaging:       'packaging',          // package/zip creation (package.ts:64)
} as const
```

Site-by-site assignment (to be applied when each notification is created/converted). The **Build types**
column is the reachability analysis — which build types can actually raise the message:

| Site | Severity today | Category | Build types | Severity decision |
|------|----------------|----------|-------------|-------------------|
| `builder.ts:465` no data for operation | Warning | Resolution | build, changelog, prefix-groups-changelog | keep Warning |
| `builder.ts:496/502` no/partial group documents match | Warning | Resolution | documentGroup, mergedSpecification | keep Warning |
| `builder.ts:563` no version documents match | Warning | Resolution | build, changelog, prefix-groups-changelog | keep Warning |
| `builder.ts:636` no such version | Error | Resolution | build, changelog, prefix-groups-changelog | **review** |
| `builder.ts:682` no version references | Error | Resolution | build, changelog, prefix-groups-changelog | **review** |
| `builder.ts:754` invalid `<type>` file | Error | DocumentParsing | build | keep Error |
| `files.ts:46` file was not parsed | Error | DocumentParsing | build | keep Error |
| `files.ts:60` cannot build document | Error | DocumentBuild | build | keep Error |
| `document.ts:173` broken refs (warning mode) | Error | References | build | **review** |
| `operations.ts:29` duplicate AsyncAPI operationId | Error | Duplicate | build | keep Error (was a throw for AsyncAPI) |
| `rest.operations.ts:126` empty path parameter | Error | Validation | build | **review** |
| `rest.operations.ts:134` double slash in path | Warning | Validation | build | keep Warning |
| `ddl.validation.ts:31` DDL `duplicate-object` issue | Error | Duplicate | build | keep Error (B3-adjacent, intra-document) |
| `ddl.validation.ts:31` DDL out-of-scope / unresolved ref | Warning | Validation | build | keep Warning |
| `deprecated.ts:141/149` tolerant hash | Error | Changelog | build | **review** |
| `rest.changes.ts:269/278` risky validation internal | Error | Changelog | build, changelog, prefix-groups-changelog | **review** |
| `package.ts:64` comparison serialization | Error | Packaging | build, changelog, prefix-groups-changelog | **review** |
| `changelog.strategy.ts:36` previous version missing | Error | Changelog | **changelog only** | keep Error |
| `mcp.ts:196` capability without entities | Warning | Mcp | build | keep Warning |

### 2a. Reachability by build type

Only `build` and the two changelog build types raise notifications at all. This matters because the story
treats `build` and `changelog` differently (a changelog may complete with errors; a `release` build may not).

**`build`-specific** (unreachable from any other build type) — the document-attributable set this story makes
tolerant, plus the deprecated-hash pair:

`builder.ts:754`, `files.ts:46`, `files.ts:60`, `document.ts:173`, `operations.ts:29`,
`rest.operations.ts:126`, `rest.operations.ts:134`, `ddl.validation.ts:31`, `deprecated.ts:141`,
`deprecated.ts:149`, `mcp.ts:196` — plus every new notification introduced by the Group A/B catch points.

**`changelog`-specific** (raised only by `ChangelogStrategy`):

| Site | Severity | Category | Note |
|------|----------|----------|------|
| `changelog.strategy.ts:36` previous version has been deleted or does not exist | Error | Changelog | Baseline missing — the comparison is meaningless. Keep Error; this is also the natural place to raise the "previous version has errors" refusal (§5). |

**Shared by `build` + `changelog` + `prefix-groups-changelog`** (everything that runs inside `compareVersions`
or package creation):

| Site | Severity | Category |
|------|----------|----------|
| `builder.ts:636` no such version | Error | Resolution |
| `builder.ts:682` no version references | Error | Resolution |
| `rest.changes.ts:269` risky validation — `beforeNormalizedValue` | Error | Changelog |
| `rest.changes.ts:278` risky validation — origins | Error | Changelog |
| `package.ts:64` comparison serialization | Error | Packaging |
| `builder.ts:465` no data for operation | Warning | Resolution |
| `builder.ts:563` no version documents match | Warning | Resolution |

`prefix-groups-changelog` reaches the shared set only; it has no notifications of its own (its group-prefix
validation throws). Note the shared Error sites are exactly the ones that make the "may a changelog complete
with errors?" question concrete — see the open decision in §5 and the final section.

**No notifications at all:** `documentGroup`, `reducedSourceSpecifications`, `mergedSpecification` (apart from
the two group-resolution warnings above) and all five export build types. Export builds return the artifact
early from `createVersionPackage` and never emit `notifications.json`; every failure there is a fatal throw.
These build types are out of scope for this story.

**Severity review is a required human step.** Every current `Error` becomes a `release`-publication blocker, so
each must be explicitly confirmed as `Error` or downgraded to `Warning`. To inform the decision, **analyze the
existing `builder_notifications` rows from the production database** (frequency of each message, whether it
historically accompanied usable published versions). This analysis is an input to the design, tracked as a
task; the "review" rows above are the candidates.

### 2b. Error notifications without a `documentId`

Every notification introduced by the Group A/B catch points is attributed. Of the notifications that already
exist, six `Error` sites still produce no `documentId` after this change. This matters because `documentId`
drives three consumers: the per-document `hasErrors` flag, the `operationTypes`/`contractsSummary` per-API-type
flags (computed from documents), and the `documentId` filter on the notifications endpoint. An unattributed
`Error` sets **version-level** `hasErrors` only — the UI shows an error mark on the version with nothing to
drill into, and no API type highlighted in the dropdown.

**Genuinely version-level** — no document exists to attribute them to; leave unattributed:

| Site | Message | Why not attributable |
|------|---------|----------------------|
| `builder.ts:636` | no such version | About the *previous* version as a whole. |
| `builder.ts:682` | no version references | Version-level reference resolution. |
| `changelog.strategy.ts:36` | previous version deleted or does not exist | Baseline version, not a document. |
| `package.ts:64` | comparison serialization failed | Raised per comparison during packaging; relates to a version pair, not one document. |

**Attributable in principle — attribution to be added by this change.** Both sites have the document in scope
already; only the plumbing is missing. Note `ApiOperation.documentId` **already holds the document slug**
(`documentId: documentSlug` in `rest.operation.ts:143`, `async.operation.ts:115`, `graphql.operation.ts:96`), so
no `fileId → slug` normalization is needed on either path.

**(i) Tolerant hash — `deprecated.ts:141/149`**

Add a `documentId` parameter to `calculateTolerantHash` and populate the notification with it:

```ts
export function calculateTolerantHash(
  value: Jso,
  notifications: NotificationMessage[],
  documentId: string,          // NEW
): string | undefined
```

Both call sites already have the slug in scope:

| Call site | Slug source |
|-----------|-------------|
| `rest.operation.ts:105` | `documentSlug`, destructured from `document` at `rest.operation.ts:87` |
| `async.operation.ts:196` and `:211` | `documentSlug`, in scope in `buildAsyncApiOperation` (used at `:115`) |

Making the parameter required (rather than optional) means the compiler enforces attribution at any future call
site.

**(ii) Risky validation — `rest.changes.ts:269/278`**

`reclassifyBreakingChanges(previousOperationId, mergedJso, diffs, ctx)` (`rest.changes.ts:231`) needs the
document. At its only call site (`rest.changes.ts:212`) the operation pair `previous` / `current` is in scope,
and each carries `documentId` as a slug. Pass the current operation's document, falling back to the previous
one for a removed operation:

```ts
await reclassifyBreakingChanges(
  previous?.operationId,
  merged,
  operationDiffs,
  ctx,
  current?.documentId ?? previous?.documentId,   // NEW
)
```

A removed operation attributes to the *previous* version's document slug, which may not exist in the current
version. That is acceptable: the notification is still returned by an unfiltered query, and the `documentId`
filter simply will not match a current document. Alternative — leave it unattributed when `current` is absent —
is simpler but loses the only locating information available; recommend attributing.

Both rows remain flagged **review** for a possible downgrade to `Warning` (§2), which is an orthogonal decision:
attribution is worth doing either way, since it improves the notifications endpoint's filtering even for
warnings, and is required if they stay `Error` so a blocked `release` can be explained.

**Side effect of the rename.** `operations.ts:29` currently writes `fileId: duplicate.documentId` — a *slug*
stored in a field named `fileId`. The rename to `documentId` (§1) corrects this latent inconsistency rather
than introducing a change; no value conversion is needed at that site.

**Consequence to accept:** the four version-level rows mean a version can have `hasErrors: true` while every
document has `hasErrors: false`. The UI must handle that — the version-level mark cannot assume a document to
point at, and the notifications endpoint (unfiltered) is the only place those messages surface. This is correct
behavior, not a gap: a missing previous version really is a version-level problem.

### 3. Catch points (make Groups A and B tolerant)

- `components/files.ts` `buildFile`: wrap `parsedFileResolver` and `buildDocument` in `try/catch`; on throw
  push an `Error` notification (category `DocumentParsing`/`DocumentBuild`) and return `buildErrorDocument(file)`
  so the file stays visible as `type: unknown` with a slug.
- `BuildStrategy.execute` per-document loop: wrap `processOperationDocument`, `validateDdlDocument` +
  `processDdlDocument`, `processMcpDocument` per document → `Error` notification, continue. The failed document
  stays published but exposes no operations/entities.
- duplicate handlers (B1–B5): emit one `Error` notification **per involved document**, same text, and keep the
  first-seen entity/operation (do not overwrite); do not throw.
- whole-set MCP validations (`validateMcpInitRequired`, `validateMcpProtocolVersion`): convert throws to `Error`
  notifications, one per affected document (for `validateMcpInitRequired`, one per document of the endpoint);
  validate all documents rather than stopping at the first failure.
- `calculateHistoryForDeprecatedItems` (A8): wrap per-operation processing; attribute to the operation's
  document slug.

The two `validateApiProcessorVersion` calls in `compare.operations.ts:68/69` are **not** wrapped — see D2.

Tolerant behavior applies to the **`build`** buildType. Export / document-group strategies keep fail-fast —
their result is a single artifact that is unusable on failure, and there is no partial version to salvage.

### 4. `release` publication is fatal when errors exist

There is **no downgrade**. After document processing, `BuildStrategy.execute` collects the `Error`-severity
notifications and, if the requested status is `release` and there is at least one, throws.

**The thrown message must not lose the specific problem.** A publisher who requested `release` should see what
is actually wrong without having to re-publish as a draft and go hunting. The message therefore depends on how
many errors there are:

**Exactly one error** — throw the notification's own message, enriched with the document when the notification
is attributed:

```text
<notification.message> (document: <documentId>)
```

and the bare `<notification.message>` when the notification has no `documentId` (a version-level error). This
gives the publisher the precise, actionable cause — the same text they would see in the notifications list.

**More than one error** — summarize, and point at the draft-publication escape hatch:

```text
Cannot publish version in release status: N critical errors in following documents: <documentIds>.
You can publish version in draft status for troubleshooting
```

where `N` is the total number of `Error` notifications and `<documentIds>` is the distinct, sorted list of slugs
they are attributed to.

Because messages are denormalized (§1), `N` counts *document-level* errors: a problem spanning two documents
has already become two notifications and counts as two. That reads correctly next to the document list — "2
critical errors in following documents: a, b" — and it means a cross-document duplicate never lands in the
single-error branch below.

Two edge cases in the multi-error message:

- **Errors with no `documentId`** still count toward `N` but contribute no slug. If *some* errors are
  attributed, list the slugs that exist — the count already signals that more errors exist than documents
  listed.
- **No error carries a `documentId`** (all version-level): the "in following documents" clause has nothing to
  list, so drop it and use
  `Cannot publish version in release status: N critical errors. You can publish version in draft status for
  troubleshooting`.

The throw makes the publish fail (build status `error`) exactly as a fatal build does today, and the message
reaches the user through the existing build-error reporting path — no new transport is needed. `draft`
publications proceed and set `hasErrors`. Doing the check in api-processor keeps release-dependent logic (e.g.
`deprecatedInPreviousVersions`) from ever running for an errored release. The backend enforces the same
invariant defensively (see Backend §2).

Minor open point: whether the single-error message should also carry the "You can publish version in draft
status for troubleshooting" hint. Omitted above per the specified behavior — the single-error message is
deliberately the raw cause — but it is a one-line change if the hint is wanted in both branches.

### 5. Changelog build rule

- A `changelog` build for a *current* version that has `Error` notifications is **allowed** to complete and
  publish its comparison result. The one exception is D2 (api-processor version mismatch), which fails the
  changelog build outright by design — a mismatch must not be masked by a partial comparison.
- A version with errors **must not be used as `previousVersion`.** Enforced primarily by the **backend** when
  it composes the changelog build config / resolves the previous version (Backend §2): refuse to start a
  changelog (or a `build` with `previousVersion`) whose previous version has `hasErrors = true`.
- Defense in depth in api-processor: `versionResolver`, when resolving the *previous* version, can surface an
  `Error` notification (category `Changelog`) if that version is flagged with errors, so a misconfigured build
  does not silently diff against a broken baseline. `VersionCache` would need to carry `hasErrors` (resolved
  from the backend's version view) for this check. The natural raise point is `ChangelogStrategy` next to the
  existing `changelog.strategy.ts:36` "previous version has been deleted or does not exist" message — the two
  are the same class of baseline problem.

**Which notifications can a changelog build actually raise?** Per §2a: one changelog-specific site
(`changelog.strategy.ts:36`) plus the five shared Error sites (`builder.ts:636`, `builder.ts:682`,
`rest.changes.ts:269`, `rest.changes.ts:278`, `package.ts:64`). Since "a changelog may complete with errors"
is now the rule, these five need an explicit decision in the severity review: they are *changelog-internal*
faults, so an `Error` here degrades the comparison quality rather than describing a bad document. Options:

1. keep them `Error` — a changelog build still completes (the rule allows it), but the same sites also fire
   during a `build`, where they would then block a `release` publication;
2. downgrade the risky-validation pair (`rest.changes.ts:269/278`) and `package.ts:64` to `Warning` — they are
   internal diff/serialization anomalies, not user-fixable document problems;
3. keep `Error` but exclude category `Changelog` / `Packaging` from the `hasErrors` computation, so
   changelog-phase faults never block a `release` build.

Recommendation: option 2 for the risky-validation pair (they are diagnostics about api-processor internals, and
a user cannot act on them), and confirm `builder.ts:636/682` as `Error` since an unresolvable version or
reference genuinely invalidates the result. Decide during the DB-driven review.

### 6. `hasErrors` flag in the build result

- **Document** (`documents.json`, via `toPackageDocument` / `PackageDocument`): add
  `hasErrors?: boolean` (optional, default `false`) — `true` when at least one `Error`-severity notification is
  attributed to that document's slug.
- **`info.json`** (the package version): add `hasErrors?: boolean` (optional, default `false`) — `true` when
  any `Error`-severity notification exists in the build.

Both are computed by api-processor from the final notifications list at package-creation time. `notifications.json`
ships the full list (new shape) so the backend can serve the notifications endpoint.

### 7. Tests

- per catch point: one bad document among good ones → good docs/operations published; bad doc present with
  `hasErrors: true`; build completes; `info.json.hasErrors: true`.
- `release` + Error notification → build/publish fails; `draft` + Error → succeeds with flags set.
- release-failure message (§4): a single attributed error throws the notification's own message plus the
  document; a single unattributed error throws the bare message; several errors throw the summary with the
  correct count and the distinct sorted slug list; several errors none of which are attributed throw the
  summary without the "in following documents" clause.
- cross-document duplicates (B1–B5): one notification emitted per involved document with identical text and
  distinct `documentId`, all involved documents flagged, first entity kept.
- D2: an api-processor version mismatch on the previous version fails the build outright, for both `draft` and
  `release`, and for a `changelog` build too — no partial version is emitted.
- the motivating scenario end to end: a version with valid REST documents and a broken AsyncAPI document
  publishes as `draft` with every REST operation present and browsable, `hasErrors: true` on the version and on
  the AsyncAPI document only, and the REST documents unflagged.
- changelog: current version with errors still produces comparisons; a previous version flagged with errors is
  rejected as a baseline.
- category assignment: each notification carries the expected `category`.
- attribution (§2b): a tolerant-hash failure and a risky-validation failure each carry the expected
  `documentId`, and the owning document is flagged `hasErrors: true`.
- unattributed errors (§2b): a version-level `Error` (e.g. missing previous version) sets
  `info.json.hasErrors: true` while every document keeps `hasErrors: false` — assert the flags and that the
  notification is returned by an unfiltered query.
- regression: no-error build unchanged.

## Backend

### 1. Internal contract — `APIHUB_API_internal.yaml` (build result shape)

In the `BuildResult` schema ("Build result for build"):

- **Add `notifications.json`** (currently consumed by `archive/BuildResultArchive.go` but missing from the
  spec) with the new shape:

  ```yaml
  notifications.json:
    type: object
    properties:
      notifications:
        type: array
        items:
          type: object
          required: [category, severity, message]
          properties:
            category:
              type: string
              description: Message category (document-parsing, document-build, duplicate, ...).
            severity:
              type: integer
              description: 0 - Error, 1 - Warning, 2 - Information, 3 - Hint
            message:
              type: string
            documentId:
              description: Slug of the document the message is attributed to.
              type: string
  ```

- `documents.json` item: add `hasErrors: { type: boolean, default: false }`.
- `info.json`: add `hasErrors: { type: boolean, default: false }`.

### 2. Publish flow changes (`qubership-apihub-service`)

- **`view.BuilderNotificationsFile` / entity `BuilderNotificationsEntity`** (`view/Package.go:346`,
  `entity/BuilderNotificationsEntity.go`, `archive/BuildResultToEntities.go:608`): replace `FileId` with
  `DocumentId` (a plain string) and add `Category`. SQL: `builder_notifications` table (`1_init.up.sql:476`) —
  rename `file_id` → `document_id`, add `category`. Requires a new migration. Because api-processor emits
  messages already denormalized by document (§1), the reader stays a straight one-notification-to-one-row map:
  no splitting, no array column, and `documentId` filtering is a plain `WHERE document_id = ?`.
- **`ValidateBuildResultAgainstConfig`** (`service/validation/PublishedValidator.go:121`): keep the strict
  `info.status == buildConfig.status` check (no downgrade). **Add** a defensive rule: if
  `buildConfig.status == release` and `info.hasErrors == true`, reject with a dedicated error code
  (`ReleasePublishWithErrors`). This backstops the api-processor check for non-standard build paths.
- **`ReadDocumentsToEntities`** (`archive/BuildResultToEntities.go:30`): persist per-document `hasErrors` into
  `published_version_content.metadata` (jsonb) — e.g. `fileEntMetadata.SetHasErrors(true)`. No content-table
  schema change.
- **`PublishPackage`** (`service/PublishedService.go`): persist version-level `hasErrors` (from `info.json`)
  into `published_version.metadata` (jsonb). No schema change.
- **Changelog previous-version guard:** where the backend resolves/validates the previous version for a
  changelog or a `build` with `previousVersion` (previous-version lookup in `PublishPackage` around
  `GetVersionIncludingDeleted`, and wherever changelog build configs are assembled), reject when the previous
  version has `hasErrors = true` with a dedicated error (`PreviousVersionHasErrors`). This is the primary
  enforcement of the changelog rule.
- **Dashboard references guard:** when publishing a package of kind `dashboard` (refs present), reject any ref
  pointing to a version with `hasErrors = true` (new error `ReferencedVersionHasErrors`). This implements
  "cannot add an errored version to a dashboard." The reference resolution already happens in
  `makePublishedReferencesEntities`; add the flag check there.

### 3. Public API — `APIHUB_API.yaml`

| Endpoint / schema | Change |
|---|---|
| `GET /api/v3/packages/{packageId}/versions` — `PackageVersion` | add `hasErrors: boolean` (default `false`) — from build result (`published_version.metadata`) |
| `GET /api/v3/packages/{packageId}/versions/{version}` — `PackageVersionContent` | add `hasErrors: boolean` (from build result); add `hasErrors: boolean` on each `operationTypes.*` item and on `contractsSummary.ddl` / `contractsSummary.mcp` — **calculated by the backend** from the version's documents (a document with `hasErrors` contributes to its apiType/contractType) |
| `GET /api/v2/packages/{packageId}/versions/{version}/documents` — `PackageVersionFile` | add `hasErrors: boolean` (default `false`) — from build result (`published_version_content.metadata`) |
| `GET /api/v3/packages/{packageId}/versions/{version}/documents/{slug}` | add `hasErrors: boolean` (per-document detail already an on-demand fetch) |
| **NEW** `GET /api/v2/packages/{packageId}/versions/{version}/notifications` | returns the version's build notifications, **filterable** by `documentId`, `severity`, `category` (repeatable query params). Served from `builder_notifications`. |

New endpoint sketch:

```yaml
/api/v2/packages/{packageId}/versions/{version}/notifications:
  get:
    tags: [Versions]
    summary: Get package version build notifications
    parameters:
      - $ref: "#/components/parameters/packageId"
      - $ref: "#/components/parameters/version"
      - name: documentId
        in: query
        description: Filter by document slug.
        schema: { type: string }
      - name: severity
        in: query
        description: Filter by severity (repeatable).
        schema:
          type: array
          items: { type: string, enum: [error, warning, information, hint] }
      - name: category
        in: query
        description: Filter by message category (repeatable).
        schema:
          type: array
          items: { type: string }
    responses:
      "200":
        description: Success
        content:
          application/json:
            schema:
              type: object
              properties:
                notifications:
                  type: array
                  items:
                    type: object
                    required: [category, severity, message]
                    properties:
                      category: { type: string }
                      severity: { type: string, enum: [error, warning, information, hint] }
                      message:  { type: string }
                      documentId: { type: string }
```

Because messages are denormalized by document (§1), an unfiltered response repeats the text of a
multi-document problem once per document, each row naming its own `documentId`. A UI listing all notifications
may group by `message` if it prefers to show such a problem once.

Notes:

- `operationTypes.*.hasErrors` and `contractsSummary.*.hasErrors` are computed by the backend from stored
  per-document `hasErrors`. Two cases produce a version-level mark with no API type highlighted, and the UI must
  tolerate both (see §2b): a document that failed before its type could be determined maps to no
  apiType/contractType; and a version-level `Error` (missing previous version, reference resolution) flags no
  document at all. In both cases `hasErrors` on the version is the only signal, and the notifications endpoint
  is where the explanation lives.
- Flags are per revision (both tables are revision-keyed); the mark disappears when a fixed revision is
  published.
- Dashboard viewing: `GET .../documents` resolves referenced packages' documents, so per-document `hasErrors`
  propagates to the dashboard document list automatically, satisfying "indicate an errored referenced version
  when viewing the dashboard's packages."

### 4. Suggested implementation order

1. api-processor: new `NotificationMessage` shape + `MessageCategory` + fileId→slug normalization; catch
   points; attribution plumbing for the two operation-level sites (§2b); `release`-with-errors fatal check;
   `hasErrors` on `documents.json`/`info.json`. (New optional fields — backward compatible for the no-error
   case.)
2. **Severity review** of existing `Error` notifications informed by production `builder_notifications`
   analysis; downgrade where agreed.
3. backend: internal spec + `builder_notifications` migration (`document_id`, `category`) + validator rules
   (release-with-errors, previous-version-has-errors, referenced-version-has-errors) + metadata persistence.
4. backend: public API fields + new notifications endpoint + `operationTypes`/`contractsSummary` computation.
5. UI (separate activity): consume the new fields/endpoint on the identified screens.

Steps 1 and 3 must land together for the fatal/guard behavior to be consistent; step 2 gates which messages
actually block `release`.

## UI follow-up (out of scope here, to be planned separately)

Recorded so the UI activity has the full set of requirements. The backend changes above provide the data for all
of it; no further backend work is implied.

### Version-level errors with no document

**The UI must provide a way to see errors that are not attributable to any specific document.** Four `Error`
notifications are inherently version-level (§2b): missing previous version, unresolvable version references,
previous version deleted or non-existent, and comparison serialization failure. They set the version's
`hasErrors` flag but flag **no document** and **no API type**, so a UI that only surfaces errors through the
documents list or the API type dropdown would show an error mark the user cannot explain or act on.

Required behavior:

- the version-level error mark must be actionable on its own — it cannot assume a document to drill into;
- there must be a path to the unfiltered notifications list
  (`GET /api/v2/packages/{packageId}/versions/{version}/notifications` with no `documentId` filter), which is
  the only place these messages appear;
- ideally, distinguish "version has errors that belong to documents" from "version has errors that belong to
  the version itself", since the remediation differs — fix a document versus fix the version's previous-version
  or reference configuration.

Note the same "mark with no drill-down target" shape also arises when a document fails before its type can be
determined (it maps to no API type); that case *does* have a document to point at, so the documents list
remains the right entry point for it.

### Other screens

- version error mark wherever a version is shown — reuse the placement of the existing
  `WarningApiProcessorVersion` indicator (`VersionPageToolbar`, `VersionDialogForm`,
  `CompareVersionsDialogForm`, `CompareRevisionsDialogForm`, `OperationPage`/`OperationContent`,
  `VersionCompareContent`, `DashboardsCompareContent`, `AddPackageDialog`), plus version lists and selectors
  fed by `GET /api/v3/packages/{packageId}/versions`.
- per-document error mark in the documents list, and error details on the document details screen.
- error icon per API type in the `ApiTypeSelector` dropdown and on the overview page, from
  `operationTypes.*.hasErrors` and `contractsSummary.ddl|mcp.hasErrors`.
- dashboard package list: indicate a referenced package version that has errors (publishing such a reference is
  refused going forward, but pre-existing dashboards may already contain one).
- notifications view with filtering by `documentId`, `severity` and `category`.

## Decisions still to confirm

1. Final `MessageCategory` value set (proposed above) — confirm during the severity review.
2. Per-message severity confirmations (the **review** rows in §2) — human decision, DB-analysis driven.
3. Notification id in the api-processor shape — recommended **not** to add (see §1).
4. Changelog-phase notifications (`rest.changes.ts:269/278`, `package.ts:64`, `deprecated.ts:141/149`): keep as
   `Error` and let them count toward the current version's `hasErrors`, downgrade to `Warning`, or exclude the
   `Changelog`/`Packaging` categories from the `hasErrors` computation? Three options weighed in §5;
   recommendation is to downgrade the risky-validation pair. Needs the review.
5. Whether `hasErrors` should be written into the changelog build result at all. A `changelog` build produces no
   `documents.json` and its `info.json` describes a comparison, not a publishable version — so the flag has no
   consumer there. Proposal: emit `hasErrors` only for `build`, and let changelog builds carry notifications
   without the flag.
6. Changelog-phase throws (`rest.changes.ts:180`, `graphql.changes.ts:136`, `async.changes.ts:148`,
   `compare.ddl.ts:192`): convert to notifications, or keep fatal? The salvageable test alone would convert
   them, but the D2 reasoning (do not mask a hard-to-diagnose defect behind a partial changelog) points the
   other way, and these are internal index/document inconsistencies rather than user-caused. Recommend keeping
   them fatal, consistent with D2.
