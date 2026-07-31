---
name: api-processor-authoring
description: Use when changing what api-processor writes into a package version build result, so its layout and list order stay stable across rebuilds.
---

# Authoring the api-processor build result

A package version is produced in three stages, and a change to its contents usually touches all three:

1. `PackageVersionBuilder.run` (`src/builder.ts`) picks a strategy from `config.buildType` and the strategy
   fills a `BuildResult` in memory.
2. `createVersionPackage` (`src/components/package.ts`) serializes that `BuildResult` into the ZIP. It is the
   only serializer, and it writes through the `ZipTool` interface rather than a concrete zip library.
3. `src/components/build-result-index.ts` holds the `build*` functions that turn each in-memory source into
   the object written to a ZIP entry, and sorts it on the way.

So shape and sort the data in `build-result-index.ts`, not at the site that produces it and not inside a
strategy. One place to read means one place to audit.

## Everything comes out in a content-defined order

Every list serialized into a package version must have an order that depends only on content. Never on `Map`
iteration order, on which async task finished first, or on the host runtime.

Republishing is the reason. A migration rebuilds an already-published version and compares the result against
the stored one. A list that merely reordered shows up as a changed build, indistinguishable from a real
regression, so non-deterministic order turns every rebuild into a false alarm.

Use the primitives already in `build-result-index.ts`:

- `sortByKey(items, key)` computes the key once per item, then compares with `<` and `>`, that is, by UTF-16
  code unit.
- Never `localeCompare`. Locale and ICU data differ between Node builds and browsers, which is exactly the
  cross-runtime nondeterminism this code exists to remove.
- `tupleKey(...parts)` builds a composite key. It is `JSON.stringify` over encoded parts, so the quoting keeps
  it collision-free; a naive `a + '|' + b` join is not.
- `encodeKeyPart` zero-pads a numeric part to width 10 so it compares numerically (revision `2` before `10`),
  and throws outside non-negative integers below `1e10`. Let it throw. Do not add a defensive branch that
  turns a bad key into a silently wrong order.

Rows order by the encoded key, so a part that is a strict prefix of another one inverts when the next
character sorts below `"` (0x22, such as a space or `!`). Free-form prose keys such as notification messages
do hit this. It is accepted: the order stays deterministic, which is the whole requirement.

## Adding a list

Build the serializable shape in a `build*` function, sort it there, and call the builder from
`createVersionPackage`:

```typescript
export function buildNotifications(notifications: NotificationMessage[]): PackageNotifications {
  return { notifications: sortByKey(notifications, notificationSortKey) }
}
```

Sort on a key that is stable across rebuilds: an id, or `tupleKey` over ids and a revision. Never an array
index, an insertion counter, a hash of mutable state, or a timestamp.

A new MCP or DDL entity kind needs no change in `build-result-index.ts`: `buildMcpFile` and `buildDdlFile`
iterate `Object.values(KIND_TO_FIELD)`, so a kind in that map is sorted automatically. Register it in the map
**and** in the grouping literal of `groupMcpEntitiesByKind` or `groupDdlEntitiesByKind`, rather than writing
another loop. A kind missing from the literal leaves `grouped[kind]` undefined and the sort throws.

## What must stay unsorted

Sort only lists whose order came from `Map` iteration or async completion. These fields follow spec parse
order, are therefore already deterministic, and must not be sorted:

`operation.tags`, `operation.models`, `operation.deprecatedItems`, `document.operationIds`, and
`operation.deprecatedInPreviousVersions`, where a lexicographic sort would be wrong anyway because it puts
`v10` before `v2` before `v9`.

`config.refs` must stay unsorted as well, for a different reason: `createInfoFile` spreads the whole config
into `info.json`, so the list reaches the ZIP straight from the caller's `BuildConfig` and its order is the
caller's, already stable for a given input. A sort was written for it once and then removed. Do not restore it.

Sorting an already-deterministic field is over-reach with a real cost. The first rebuild after such a change
emits a one-time false "changed" diff, the exact false positive this ordering work exists to eliminate. Only
`deprecatedInPreviousVersions` has a guard test, so for the other five this rule is the whole net.

## Names of ZIP entries

Index files and directories are named from `PACKAGE` in `src/consts.ts`, never from a literal path. A per-item
entry is named after the item, and two conventions coexist, so picking the wrong one produces a file nobody
can read back:

- Data files carry **no extension**: `operations/<operationId>`, `mcp/<mcpEntityId>`, `ddl/<ddlEntityId>`, and
  `comparisons/<comparisonFileId>` with its `ddl-comparisons/` sibling.
- Internal documents under `version-internal-documents/` and `comparison-internal-documents/` are
  `<id>.json`, built by `internalDocumentEntry`.

## Writing through `ZipTool`

Three sinks implement the interface: `JsZipTool` in the browser, `AdmZipTool` for Node, and a disk-backed
adapter in tests. They agree on everything the current writers do, and diverge in two places.

Call `folder()` on the root `zip` only. `AdmZipTool.folder` replaces the prefix instead of composing it, so a
nested `folder(a).folder(b)` writes to `b/<entry>` under Node, while the other two nest, and the divergence
stays invisible until a published version is read back.

The index writes deliberately do not await `ZipTool.file`, because both production sinks register a plain
object or string synchronously and the test adapter drains the un-awaited calls inside `buildResult()`. `Blob`
content is the exception and must be awaited: `AdmZipTool` adds the entry only after `arrayBuffer()` resolves
and its `buildResult()` has nothing to drain, so a fire-and-forget `Blob` write goes missing from the ZIP.

## An index row and its data file travel together

A list index and the per-item files it points at must be written from one filter, so a row can never point at
a file the writer skipped. `takeVersionInternalDocumentEntry` and `takeComparisonInternalDocumentEntry` serve
exactly this purpose: the index builder and the ZIP writer both call them, so a document lands in both places
or in neither. When adding a list with per-item files, extract the same kind of predicate instead of
repeating the condition on each side.

## Export builds return before the index files

For every `EXPORT_*` build type, `createVersionPackage` returns early: one export document comes back as a raw
`Buffer`, several are zipped as they are. Nothing below that switch runs for an export, so an export-only
artifact has to be written above it, while everything below it runs for every non-export build type, group and
merged builds included.
