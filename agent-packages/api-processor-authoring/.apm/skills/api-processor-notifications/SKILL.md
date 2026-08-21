---
name: api-processor-notifications
description: Use when adding a diagnostic to api-processor, turning a throw into a reported problem, or deciding whether a failure should abort the build — covers categories, slug attribution, the two notification streams, and severity.
---

# Reporting a problem instead of throwing

A version publishes what it could build. One broken document must not cost the version the documents that
built cleanly, so a problem becomes a `NotificationMessage` and the build keeps going.

## Raise it where it happens, with a category and a slug

`NotificationMessage` is `{ category, severity, message, documentId? }`.

- **`category` comes from `MESSAGE_CATEGORY` (`src/consts.ts`), one value per diagnostic**, never shared by
  two checks: a consumer filters on it instead of matching interpolated text. A new check adds a value there.
- **`documentId` is the document's slug, and it is set where the problem is found** — never a `fileId`, never
  a path, never converted later by a pass that walks the finished list. Only the site that detects the problem
  still knows which document it belongs to; if a function needs a slug it does not have, give it the
  parameter rather than reconstructing the attribution afterwards.
- **A problem spanning several documents produces one message per document.** A single message listing them
  all would leave every one of them unflagged.
- **Severity comes from the source, not from the catch site.** A reference problem takes it from its
  `errorType`, a parse problem from the parser's own diagnostic — but only when that diagnostic's severity is
  one of the four `MESSAGE_SEVERITY` values, because the consumer rejects the whole archive over one it does
  not know. A `catch` block that stamps every message `Error` throws away what the producer knew.

A duplicate id is reported by whichever site can still see both claimants. Across documents that is
`createCrossDocumentDuplicateHandler` (`src/utils/document.ts`), for operations, MCP and DDL entities alike;
only the operation handler varies severity — `Error` for AsyncAPI, `Warning` for REST and GraphQL. Inside one
document it is the api type's own category (`rest-duplicate-operation`, `async-duplicate-operation`), raised
against that document, which keeps the operations it did build. MCP and DDL still throw there: they collide
while mapping entities, so nothing was built to keep.

## The stream is the context's, not the call site's

There are two lists, and code never picks between them. It writes to `ctx.notifications`, and which list that
is was decided when the context was made: a builder context carries the build's list, and
`CompareContext.forPair` narrows a compare context to the list of the version pair being compared. A resolver
shared by both reaches the right list because it was bound to the context that called it.

Consequences worth knowing before you touch this:

- **Never reassign a notifications array.** A context bound through `bind` holds the array it was made with,
  so an assignment leaves it writing into a discarded list while the new one silently stays empty. Clear with
  `.length = 0` as `clearCaches` does, or swap contents with `replaceInPlace` (`src/utils/arrays.ts`) as
  `setBuildResult` does — the fields are `readonly` so the compiler catches an assignment.
- The comparison stream ships per version pair, and a comparison the host served from its cache ships **no
  row at all**. An empty row would wipe the messages stored by the build that actually calculated it.
- A message raised before any pair exists — resolving the baseline, enumerating references — ships under the
  pair the config declared (`DeclaredPair` in `src/components/build-result-index.ts`); whether the backend
  accepts a row for a pair no comparison calculated is still being settled with it.

## Deciding whether a failure may be caught

Apply one test: **after this failure, is there still something worth publishing?** A document that failed to
parse leaves its neighbours intact, so it is caught, published as a stub with its source bytes and no
operations, and reported. A failure that leaves nothing — or leaves a result that would mislead — is not.

The deliberate exceptions, all of them:

| Stays fatal | Why |
|-------------|-----|
| invalid build config, including a changelog with no baseline | there is no subject to build |
| packaging / zip failure | no artifact was produced |
| a host resolver was not wired | a deployment defect, identical for every build |
| api-processor version mismatch between the compared versions | a partial changelog would mask it beyond tracing |
| an operation in the index but not in the documents pair | internal inconsistency, not a user error |
| no DDL compare hook registered while DDL documents exist | the same |
| a dashboard reference whose comparison has errors | the aggregate has no correct part to keep |

The last one is the only comparison error that aborts a **draft** as well. Every other release rule is about
status: a draft publishes marked, a release throws. `src/components/release-gate.ts` owns that, and no other
site should be checking `status` to decide whether an error is fatal. A message raised after `BuildStrategy`
has gated needs its own call: `comparison-serialization` appears while the archive is written, so
`createVersionPackage` gates the comparison stream again, for `BUILD_TYPE.BUILD` only.

Fatal failures are covered by `test/fatal-failures.test.ts`. Adding one means adding a case there — a throw
with no test is indistinguishable from a throw someone forgot to convert.

## Adding a diagnostic, in order

1. Add the `MESSAGE_CATEGORY` value.
2. Push the message at the detection site, with the slug and the severity the producer knows.
3. Cover attribution in `test/notification-attribution.test.ts`: the message reaches the right stream and
   names the right slug.
4. If the new value can block a release, check what it does to the existing fixtures — enabling the gate is a
   detector, and a fixture that starts failing is usually telling the truth.
