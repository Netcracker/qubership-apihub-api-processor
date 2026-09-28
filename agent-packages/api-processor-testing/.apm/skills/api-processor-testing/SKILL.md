---
name: api-processor-testing
description: Use when adding or changing api-processor tests or test helpers — choosing a fixture, picking a package id, placing a spy, adding a helper, or proving a test can fail.
---

# Writing api-processor tests

A test must fail only when the behavior it guards breaks. Another scenario's fixture, a version another test
published, or a spy that never fires can each keep it green while `src` is broken, and then the run proves nothing.

Tests are Jest + ts-jest (`jest.config.ts`). Run one file with `npm test -- test/<file>.test.ts`, and one case by
adding `-t '<name>'`. The helpers a test needs are exported from `test/helpers` (`index.ts`); a helper's JSDoc is
the contract to rely on.

## Build the input by what the test asserts

- **A test that asserts nothing about the content takes a standard fixture.** A build, a changelog, or a
  notification path often needs just *a* document: take one from `test/helpers/fixtures.ts` and build it with
  `contentEditor`, `buildPackageFromContent`, `publishChangeFromContent`, or `buildChangelogFromContent`. Rely only
  on what the fixture's JSDoc promises.

  ```typescript
  const result = await buildChangelogFromContent('annotation/summary-changed', ANY_REST_CHANGE)
  ```

- **A test that asserts on the content owns that content.** Write it inline and build it through the same helpers,
  or give the test a folder of its own under `test/projects`. Do not borrow another scenario's folder: a folder
  belongs to the tests that assert what is in it, and an edit made for them silently changes your test.

Most existing tests build from a folder: `Editor.openProject(folder)`, `LocalRegistry.openPackage(folder)` with
`publish(folder, config)`, or a wrapper in `builders.ts` such as `buildChangelogPackage`. A new test in such a file
follows the rules above, and the rest of the file keeps its style, so a change that adds one case leaves the others
alone.

A fixture broken on purpose says so in its name or folder, so a reader who sees its build report an error knows the
error is the point: `broken-ref.yaml`, `invalid-critical-async.yaml`, `test/projects/broken/`, or the scenario it
breaks (`operationId-collisions/`).

## Publish under a package id of its own

Published versions live in one in-memory tree per test file, and under `npm run test:disk` in one directory per
Jest worker, shared by every file that worker runs. Publish under a `packageId` that no other test, in this file
or another, publishes: a path naming the subject and the case (`annotation/summary-changed`).

- **The content builders take any id, so pass one per test.**
- **The folder wrappers publish under the folder path.** `publishVersion`, `buildChangelogPackage`, and
  `prepareChangelogPackage` do. To publish a folder under another id, call `publish` directly; it takes the folder
  and the id separately:

  ```typescript
  const registry = LocalRegistry.openPackage(folder)
  await registry.publish(folder, { packageId, version: 'v1', files: [{ fileId: 'spec.json' }] })
  ```

  Without `files`, `publish` takes the file list from the folder's `config.json`, and a folder without one fails
  the build with `Incorrect config: No files and refs`. A listed file the folder lacks throws before the build, here
  and in the editor's `run` and `update`, and `contentEditor` refuses one outside its contents. To test how a build
  reports a missing file, list it in the `files` of a `publishFromContent` call without giving its content. `publish`
  defaults to a release, so a folder whose build or comparison reports an `Error` needs
  `status: VERSION_STATUS.DRAFT`.

## Reach for the helper category first

A lookup, count check, or matcher written inline drifts from the shared one, and the next fix lands in only one of
them. Look in the category under `test/helpers/` first:

- `builders`: publishing versions; building packages, changelogs, and dashboards.
- `fixtures`: the standard documents.
- `accessors`: looking up an operation, document, change, or notification in a build result.
- `assertions`: change and impact counts, and other checks shared across files.
- `matchers`: partial matchers for `expect`.
- `factories`: REST documents and operations built in code.
- `files`, `documents`: reading fixture files and packed archives; parsing and normalizing documents.
- `registry`: the local registry, and reading back what a build published.
- `editor`: the editor that runs a build against a registry's resolvers.

## Where a helper goes

- **A helper any test could use goes in its category, even with one caller.** The next caller looks for it there
  and nowhere else.
- **A new export must be reachable from `test/helpers`.** `index.ts` re-exports each category file with
  `export *`, but `registry/index.ts` names its exports one by one, so a new helper there needs its name added. A
  new category, or a new file under `editor/` or `registry/`, needs a line in the nearest `index.ts`.
- **A helper tied to one file's cases stays in that file.** The AsyncAPI generators in
  `asyncapi-changelog-apikind.test.ts` are an example: where they place the api kind drives that file's expected
  verdicts.

## Adding a helper or a standard fixture, in order

1. Check that it earns its place. A helper does when a test other than the helper's own tests calls it in the same
   change; a wrapper that only shortens a call does not. A standard fixture does when a test needs any document of
   a kind, or a kind of change, that no fixture promises. No dead-code check runs over `test/`, so nothing flags an
   export that no test uses.
2. Grep `test/` for a local declaration of the new name. If one exists, importing the export into that file later
   fails to compile, or binds the wrong name when the local sits in an inner scope. Rename the local to say what it
   means there, or choose another export name.
3. Place and export it as described above; a standard fixture goes in `fixtures.ts`.
4. Test what it promises. A helper with behavior of its own (a lookup that throws with the ids it saw, a count
   check, an editor that refuses a file) gets tests in `test/<category>.test.ts`; the first such test of a category
   creates the file. Run a keyed lookup over a real build, because a hand-written result repeats your own assumption
   about its keys. A hand-written result is enough for the nothing-found case and for a helper that depends only on
   a constant, such as a severity. A standard fixture gets a case in `fixtures.test.ts` for each promise its JSDoc
   makes, one per promised file id or extension, published under a `fixtures/...` id.

## Where a spy goes decides whether it sees the call

- **Spy on the module that defines the function, never on the `../src` barrel.** `src` calls the function
  through its own module, so a spy on the barrel installs without an error and intercepts nothing.
- **A call from inside the same module is intercepted only when the function is an `export const`.** A call to
  an `export function` from its own module goes straight to the local binding, and the spy misses it. Spy instead
  on the nearest caller up the chain that another module calls, or that is an `export const`. Calls from another
  module are intercepted either way.

  A cross-module spy (`rest.operations.ts` imports `buildRestOperation`):

  ```typescript
  import * as restOperation from '../src/apitypes/rest/rest.operation'

  jest.spyOn(restOperation, 'buildRestOperation').mockImplementation(() => {
    throw new Error('operation exploded')
  })
  ```

- **The editor copies its registry's resolvers when it is created.** Spy on the registry you pass to the editor,
  before you create it. An editor created without a registry (`changelogEditor(id)`, `prepareChangelogPackage`)
  opens its own, so only a spy on `LocalRegistry.prototype` installed first reaches it. A spy on
  `editor.builder` methods works after construction.

`jest.config.ts` sets no `restoreMocks`, so a spy on a module or a prototype leaks into later tests unless
restored, for example in `afterEach(() => { jest.restoreAllMocks() })`.

## Prove the test can fail

A new or changed assertion is done when it has been seen to fail for the reason it exists.

1. Break the code path the assertion guards, in `src` or, for a helper test, in the helper: remove a call, invert
   a condition, or return early.
2. Run the test and check that it fails **at this assertion's line**, not at an earlier one or with a crash.
3. Undo the edit and rerun the test to see it pass.

A failure produced by injecting a value into the result (a spy that pushes a message) proves only that the
assertion is live, not that it catches a regression; say so in a comment on the assertion.

An assertion that no single `src` change can fail, such as a shape the types already force, is structural. Keep
one only when a later assertion would pass vacuously without it, as an `every` over an empty list does, and name
that later assertion in a comment.
