/**
 * Copyright 2024-2025 NetCracker Technology Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, expect, jest, test } from '@jest/globals'
import { buildWithVersionOverrides, Editor, LocalRegistry } from './helpers'
import {
  ASYNCAPI_API_TYPE,
  BUILD_TYPE,
  GRAPHQL_API_TYPE,
  MESSAGE_CATEGORY,
  MESSAGE_SEVERITY,
  REST_API_TYPE,
  VERSION_STATUS,
} from '../src/consts'
import { AdmZipTool } from '../src/components/adm-zip-tool'
import { createVersionPackage, ZipTool } from '../src/components/package'
import { compareVersionsDdl } from '../src/components/compare/compare.ddl'
import { compareDocuments as compareRestDocuments } from '../src/apitypes/rest/rest.changes'
import { compareDocuments as compareGraphqlDocuments } from '../src/apitypes/graphql/graphql.changes'
import { compareDocuments as compareAsyncDocuments } from '../src/apitypes/async/async.changes'
import {
  BuilderContext,
  BuildConfigFile,
  BuildResult,
  BuildType,
  CompareOperationsPairContext,
  DocumentsCompare,
  OperationsApiType,
  VersionStatus,
} from '../src/types'
import { NotificationsError, PackageVersionBuilder } from '../src/processor'

// The other half of tolerant publication: the problems that still abort the build. Every case here used to
// throw and must keep throwing — a notification instead would either publish nothing useful or bury a
// deployment defect that is untraceable afterwards.

const BEFORE = 'v1'
const AFTER = 'v2'
const REST_PAIR = 'declarative-changes-in-rest-operation/case1'

/**
 * Publishes a before/after pair and compares the two documents against an empty operation index. The index is
 * built by the caller of `compareDocuments`, so an empty one is exactly the internal inconsistency the throw
 * guards: the pair has operations, the index that drives the comparison knows none of them.
 */
async function compareAgainstEmptyIndex(
  packageId: string,
  apiType: OperationsApiType,
  before: BuildConfigFile[],
  after: BuildConfigFile[],
  compareDocuments: DocumentsCompare,
): Promise<unknown> {
  const registry = new LocalRegistry(packageId)
  await registry.publish(packageId, { packageId, version: BEFORE, files: before })
  await registry.publish(packageId, { packageId, version: AFTER, files: after })

  const [prevDoc] = (await registry.versionDocumentsResolver(BEFORE, packageId))!.documents
  const [currDoc] = (await registry.versionDocumentsResolver(AFTER, packageId))!.documents

  // only the fields the compare functions read before reaching the lookup; the rest is never touched
  const ctx = {
    apiType,
    notifications: [],
    rawDocumentResolver: registry.rawDocumentResolver.bind(registry),
    previousVersion: BEFORE,
    currentVersion: AFTER,
    previousPackageId: packageId,
    currentPackageId: packageId,
  } as unknown as CompareOperationsPairContext

  return compareDocuments({}, prevDoc, currDoc, ctx)
}

describe('An operation missing from the documents pair aborts the comparison', () => {
  test('should stay fatal for rest', async () => {
    await expect(compareAgainstEmptyIndex(
      REST_PAIR,
      REST_API_TYPE,
      [{ fileId: 'before.yaml', publish: true }],
      [{ fileId: 'after.yaml' }],
      compareRestDocuments,
    )).rejects.toThrow(/Can't find the .* operation from documents pair/)
  }, 30000)

  test('should stay fatal for graphql', async () => {
    await expect(compareAgainstEmptyIndex(
      'graphql-changes/change-inside-operation',
      GRAPHQL_API_TYPE,
      [{ fileId: 'before.gql', publish: true }],
      [{ fileId: 'after.gql' }],
      compareGraphqlDocuments,
    )).rejects.toThrow(/Can't find the .* operation from documents pair/)
  }, 30000)

  test('should stay fatal for asyncapi', async () => {
    await expect(compareAgainstEmptyIndex(
      'asyncapi-changes/operation/add-with-changed-message',
      ASYNCAPI_API_TYPE,
      [{ fileId: 'before.yaml', publish: true }],
      [{ fileId: 'after.yaml' }],
      compareAsyncDocuments,
    )).rejects.toThrow(/Can't find the .* operation from documents pair/)
  }, 30000)
})

describe('A missing DDL compare hook aborts the comparison', () => {
  test('should stay fatal when DDL documents have no compareDdlDocuments registered', async () => {
    const packageId = 'fatal-failures/ddl'
    const registry = new LocalRegistry(packageId)
    // draft: the fixture carries DDL notifications of its own, and this test is about the comparison
    for (const version of [BEFORE, AFTER]) {
      await registry.publish('ddl-build', {
        packageId,
        version,
        status: VERSION_STATUS.DRAFT,
        files: [{ fileId: 'shop.sql', publish: true }],
      })
    }

    const ctx = {
      notifications: [],
      ...registry.versionResolvers,
      apiBuilders: [],
    } as unknown as Parameters<typeof compareVersionsDdl>[2]

    await expect(compareVersionsDdl([BEFORE, packageId], [AFTER, packageId], ctx))
      .rejects.toThrow(/no DDL compare hook/)
  }, 30000)
})

// The missing `packageId` and `version` halves live in `config.test.ts`; this is the third rule of the same
// check, and the one with nothing to publish even in principle.
describe('An invalid build config aborts the build', () => {
  test('should reject a build with neither files nor refs', async () => {
    const editor = await Editor.openProject('basic', LocalRegistry.openPackage('basic'))
    await expect(editor.run({ version: BEFORE, buildType: BUILD_TYPE.BUILD, files: [], refs: [] }))
      .rejects.toThrow(/Got no files and refs/)
  })

  // A changelog is the comparison and nothing else: with no baseline there is nothing to compute, so this
  // fails before any work rather than publishing an empty changelog with no explanation.
  test('should reject a changelog build with no previousVersion', async () => {
    const editor = await Editor.openProject('basic', LocalRegistry.openPackage('basic'))
    await expect(editor.run({ version: AFTER, buildType: BUILD_TYPE.CHANGELOG, previousVersion: undefined } as never))
      .rejects.toThrow(/A changelog build requires previousVersion/)
  })

  // the config failure replaced a notification, so the retired category must not come back with it
  test('should keep previous-version-missing out of the categories', () => {
    expect(Object.values(MESSAGE_CATEGORY)).not.toContain('previous-version-missing')
  })

  // prefix-groups-changelog compares one version against itself across two prefix groups, so it has no
  // baseline by design and the rule above must not reach it
  test('should accept a prefix-groups-changelog build with no previousVersion', async () => {
    const editor = await Editor.openProject('basic', LocalRegistry.openPackage('basic'))
    await expect(editor.run({
      version: AFTER,
      buildType: BUILD_TYPE.PREFIX_GROUPS_CHANGELOG,
      previousVersion: undefined,
    } as never)).resolves.toBeDefined()
  })

  test('should accept a changelog that has a baseline', async () => {
    const registry = new LocalRegistry(REST_PAIR)
    await registry.publish(REST_PAIR, { packageId: REST_PAIR, version: BEFORE, files: [{ fileId: 'before.yaml', publish: true }] })
    await registry.publish(REST_PAIR, { packageId: REST_PAIR, version: AFTER, files: [{ fileId: 'after.yaml' }] })

    const editor = new Editor(REST_PAIR, {
      packageId: REST_PAIR,
      version: AFTER,
      previousVersionPackageId: REST_PAIR,
      previousVersion: BEFORE,
      buildType: BUILD_TYPE.CHANGELOG,
      status: VERSION_STATUS.DRAFT,
    } as never, {}, registry)

    await expect(editor.run()).resolves.toBeDefined()
  }, 30000)
})

// A host that wires no resolver has a deployment defect, not a content one: it breaks identically for every
// build, so a notification would only bury it.
describe('A missing host resolver aborts the build', () => {
  test('should stay fatal for a changelog with no versionResolver', async () => {
    const builder = new PackageVersionBuilder({
      packageId: REST_PAIR,
      version: AFTER,
      previousVersionPackageId: REST_PAIR,
      previousVersion: BEFORE,
      buildType: BUILD_TYPE.CHANGELOG,
      status: VERSION_STATUS.DRAFT,
    }, { resolvers: { fileResolver: () => Promise.resolve(null) } })

    await expect(builder.run()).rejects.toThrow(/No versionResolver provided/)
  })
})

describe('A packaging failure aborts the build', () => {
  afterEach(() => { jest.restoreAllMocks() })

  test('should stay fatal when the archive cannot be written', async () => {
    const editor = new Editor(REST_PAIR, {
      packageId: REST_PAIR,
      version: BEFORE,
      status: VERSION_STATUS.DRAFT,
      files: [{ fileId: 'before.yaml' }],
    } as never)
    await editor.run()

    jest.spyOn(AdmZipTool.prototype, 'file').mockImplementation(() => {
      throw new Error('disk is full')
    })

    // no notification, no partial archive: the artifact does not exist, so there is nothing to publish
    await expect(editor.createNodeVersionPackage()).rejects.toThrow(/disk is full/)
  }, 30000)
})

// The stored api-processor version is what the host holds for a published version. A mismatch means the
// changelog would be computed across two different processors and quietly come out partial, so it aborts —
// the same for a changelog and for a build that carries `previousVersion`, released or draft.
describe('An api-processor version mismatch aborts the build whatever it is building', () => {
  const cases: Array<[string, BuildType, VersionStatus]> = [
    ['changelog', BUILD_TYPE.CHANGELOG, VERSION_STATUS.RELEASE],
    ['release-build', BUILD_TYPE.BUILD, VERSION_STATUS.RELEASE],
    ['draft-build', BUILD_TYPE.BUILD, VERSION_STATUS.DRAFT],
  ]

  test.each(cases)('should stay fatal for a %s', async (name, buildType, status) => {
    await expect(buildWithVersionOverrides(`fatal-failures/mismatch-${name}`, { v1: '99.0.0' }, { buildType, status }))
      .rejects.toThrow(/previous version was built using an outdated api-processor/)
  }, 30000)
})

// A failed build writes no archive, so the error is the only way the messages collected before the failure
// reach the client
describe('A fatal failure carries what the build reported before it', () => {
  afterEach(() => { jest.restoreAllMocks() })

  const STORAGE_FAILURE = 'file storage is unreachable'

  // `missing.yaml` resolves to nothing, which the build reports and survives. `unreachable.yaml` rejects a
  // macrotask later, so that report is already on the list when the build aborts. Once `storageIsUp` is set,
  // both files resolve to nothing and the build completes with two reports.
  const storageFailureBuilder = (flags: { storageIsUp: boolean }, previousVersion?: string): PackageVersionBuilder =>
    new PackageVersionBuilder({
      packageId: 'fatal-failures/storage-failure',
      version: AFTER,
      previousVersion,
      status: VERSION_STATUS.DRAFT,
      buildType: BUILD_TYPE.BUILD,
      files: [{ fileId: 'missing.yaml' }, { fileId: 'unreachable.yaml' }],
    }, {
      resolvers: {
        versionResolver: () => Promise.resolve(null),
        fileResolver: (fileId: string) => (fileId === 'missing.yaml' || flags.storageIsUp
          ? Promise.resolve(null)
          : new Promise((_, reject) => setTimeout(() => reject(new Error(STORAGE_FAILURE)), 0))),
      },
    })

  const missingFileReport = expect.objectContaining({ category: MESSAGE_CATEGORY.FileNotParsed, documentId: 'missing' })

  test('should carry the messages raised before a fatal in the document loop', async () => {
    const error = await storageFailureBuilder({ storageIsUp: false }).run().catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(NotificationsError)
    // the text every client sends to the backend
    expect(`${error}`).toBe(`Error: ${STORAGE_FAILURE}`)
    expect((error as NotificationsError).cause).toEqual(new Error(STORAGE_FAILURE))
    expect((error as NotificationsError).notifications).toEqual([missingFileReport])
    expect((error as NotificationsError).comparisonNotifications).toEqual([])
  })

  // the build copies the root pair's array into `comparisonNotifications` only after the document loop, so a
  // fatal inside the loop leaves the message in that array alone
  test('should carry a baseline that does not resolve when the document loop fails', async () => {
    const error = await storageFailureBuilder({ storageIsUp: false }, 'no-such-version').run()
      .catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(NotificationsError)
    expect((error as NotificationsError).comparisonNotifications).toEqual([
      expect.objectContaining({ category: MESSAGE_CATEGORY.VersionNotResolved }),
    ])
  })

  // `compareVersions` throws before it returns the root pair, so the changelog's own array is the only holder
  // of the baseline's messages
  test('should carry the messages of the baseline when a changelog fails inside the comparison', async () => {
    const packageId = 'fatal-failures/changelog-comparison-failure'
    const registry = LocalRegistry.openPackage(REST_PAIR)
    await registry.publish(REST_PAIR, { packageId, version: BEFORE, files: [{ fileId: 'before.yaml' }] })
    await registry.publish(REST_PAIR, { packageId, version: AFTER, files: [{ fileId: 'after.yaml' }] })
    // spied before the editor binds the resolvers: the host lists no references, then goes down
    jest.spyOn(registry, 'versionReferencesResolver').mockResolvedValue(null as never)
    jest.spyOn(registry, 'versionOperationsResolver').mockRejectedValue(new Error(STORAGE_FAILURE))
    const editor = new Editor(REST_PAIR, {
      packageId,
      version: AFTER,
      previousVersion: BEFORE,
      status: VERSION_STATUS.DRAFT,
      buildType: BUILD_TYPE.CHANGELOG,
    } as never, {}, registry)

    const error = await editor.run().catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(NotificationsError)
    expect(`${error}`).toBe(`Error: ${STORAGE_FAILURE}`)
    expect((error as NotificationsError).notifications).toEqual([])
    // one message per side of the pair: neither version has a reference list
    expect((error as NotificationsError).comparisonNotifications).toEqual([
      expect.objectContaining({ category: MESSAGE_CATEGORY.VersionRefsNotResolved }),
      expect.objectContaining({ category: MESSAGE_CATEGORY.VersionRefsNotResolved }),
    ])
  }, 30000)

  // the failing file rejects first and a slower file reports afterwards; the build waits for every file, so the
  // report is on the failure whatever the timing
  test('should carry what a slower file reports after another file failed', async () => {
    const builder = new PackageVersionBuilder({
      packageId: 'fatal-failures/storage-failure-race',
      version: AFTER,
      status: VERSION_STATUS.DRAFT,
      buildType: BUILD_TYPE.BUILD,
      files: [{ fileId: 'unreachable.yaml' }, { fileId: 'late.yaml' }],
    }, {
      resolvers: {
        fileResolver: (fileId: string) => (fileId === 'late.yaml'
          ? new Promise(resolve => setTimeout(() => resolve(null), 20))
          : Promise.reject(new Error(STORAGE_FAILURE))),
      },
    })

    const error = await builder.run().catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(NotificationsError)
    expect((error as NotificationsError).notifications).toEqual([
      expect.objectContaining({ category: MESSAGE_CATEGORY.FileNotParsed, documentId: 'late' }),
    ])
  })

  // no `buildType` falls back to the build strategy, which wraps its failures like an explicit `build`
  test('should carry the messages of a build with no build type', async () => {
    const builder = storageFailureBuilder({ storageIsUp: false })
    builder.config = { ...builder.config, buildType: undefined } as never

    const error = await builder.run().catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(NotificationsError)
    expect((error as NotificationsError).notifications).toEqual([missingFileReport])
  })

  // the next `run()` empties the builder's arrays in place and fills them again
  test('should keep the lists of the first failure when the builder runs again', async () => {
    const flags = { storageIsUp: false }
    const builder = storageFailureBuilder(flags)
    const error = await builder.run().catch((thrown: unknown) => thrown) as NotificationsError

    flags.storageIsUp = true
    await builder.run()

    // the second build reports both files, so a list that aliases the builder's array holds two messages
    expect(builder.notifications).toHaveLength(2)
    expect(error.notifications).toEqual([missingFileReport])
  })
})

describe('A packaging failure carries what the build reported', () => {
  afterEach(() => { jest.restoreAllMocks() })

  const DISK_FULL = 'disk is full'

  test('should carry both streams of a build', async () => {
    const project = 'tolerant-publication'
    // a draft with a broken document and a baseline that does not resolve: one message in each stream
    const editor = new Editor(project, {
      packageId: 'fatal-failures/packaging-failure',
      version: AFTER,
      previousVersion: 'no-such-version',
      status: VERSION_STATUS.DRAFT,
      buildType: BUILD_TYPE.BUILD,
      files: [{ fileId: 'rest.json' }, { fileId: 'broken-async.yaml' }],
    }, {}, LocalRegistry.openPackage(project))
    await editor.run()
    jest.spyOn(AdmZipTool.prototype, 'file').mockImplementation(() => {
      throw new Error(DISK_FULL)
    })

    const error = await editor.createNodeVersionPackage().catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(NotificationsError)
    expect(`${error}`).toBe(`Error: ${DISK_FULL}`)
    expect((error as NotificationsError).cause).toEqual(new Error(DISK_FULL))
    expect((error as NotificationsError).notifications)
      .toContainEqual(expect.objectContaining({ severity: MESSAGE_SEVERITY.Error }))
    expect((error as NotificationsError).comparisonNotifications).toEqual([
      expect.objectContaining({ category: MESSAGE_CATEGORY.VersionNotResolved }),
    ])
  }, 30000)

  test('should carry the comparison stream of a changelog, with an empty build stream', async () => {
    const packageId = 'fatal-failures/changelog-packaging-failure'
    const registry = LocalRegistry.openPackage(REST_PAIR)
    await registry.publish(REST_PAIR, { packageId, version: BEFORE, files: [{ fileId: 'before.yaml' }] })
    await registry.publish(REST_PAIR, { packageId, version: AFTER, files: [{ fileId: 'after.yaml' }] })
    // the host lists no references, so the root pair carries a message
    jest.spyOn(registry, 'versionReferencesResolver').mockResolvedValue(null as never)
    const editor = new Editor(REST_PAIR, {
      packageId,
      version: AFTER,
      previousVersion: BEFORE,
      status: VERSION_STATUS.DRAFT,
      buildType: BUILD_TYPE.CHANGELOG,
    } as never, {}, registry)
    await editor.run()
    jest.spyOn(AdmZipTool.prototype, 'file').mockImplementation(() => {
      throw new Error(DISK_FULL)
    })

    const error = await editor.createNodeVersionPackage().catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(NotificationsError)
    expect((error as NotificationsError).notifications).toEqual([])
    expect((error as NotificationsError).comparisonNotifications)
      .toContainEqual(expect.objectContaining({ category: MESSAGE_CATEGORY.VersionRefsNotResolved }))
  }, 30000)

  // with no `buildType` the packager treats the build as a `build`
  test('should carry the streams of a build with no build type', async () => {
    const project = 'tolerant-publication'
    const editor = new Editor(project, {
      packageId: 'fatal-failures/packaging-failure-no-type',
      version: AFTER,
      status: VERSION_STATUS.DRAFT,
      files: [{ fileId: 'rest.json' }, { fileId: 'broken-async.yaml' }],
    } as never, {}, LocalRegistry.openPackage(project))
    await editor.run()
    jest.spyOn(AdmZipTool.prototype, 'file').mockImplementation(() => {
      throw new Error(DISK_FULL)
    })

    const error = await editor.createNodeVersionPackage().catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(NotificationsError)
    expect((error as NotificationsError).notifications)
      .toContainEqual(expect.objectContaining({ severity: MESSAGE_SEVERITY.Error }))
  }, 30000)

  // two export documents, so the archive is written rather than the single document returned as it is
  test('should throw the plain error of an export', async () => {
    const buildType = BUILD_TYPE.EXPORT_VERSION
    const buildResult = {
      config: { buildType },
      comparisons: [],
      ddlComparisons: [],
      documents: new Map(),
      exportDocuments: [
        { filename: '1.yaml', data: new Blob(['a']) },
        { filename: '2.yaml', data: new Blob(['b']) },
      ],
      notifications: [],
      comparisonNotifications: [],
    } as unknown as BuildResult
    const zip: ZipTool = {
      file: () => Promise.reject(new Error(DISK_FULL)),
      folder: () => zip,
      buildResult: () => Promise.resolve(null),
    }
    const ctx = { config: { buildType } } as unknown as BuilderContext

    const error = await createVersionPackage(buildResult, zip, ctx).catch((thrown: unknown) => thrown)

    expect(error).toEqual(new Error(DISK_FULL))
    expect(error).not.toBeInstanceOf(NotificationsError)
  })
})

// A config the build cannot start from is rejected before any message exists, so it is the plain error: the
// status request then carries no notifications part
describe('An invalid config is rejected before the build starts', () => {
  test('should throw the plain error for a build with neither files nor refs and no build type', async () => {
    const builder = new PackageVersionBuilder({
      packageId: 'fatal-failures/no-files-no-type',
      version: AFTER,
      // a baseline the host does not have: resolving it first would raise a message the error could carry
      previousVersion: 'no-such-version',
      status: VERSION_STATUS.DRAFT,
      files: [],
      refs: [],
    } as never, { resolvers: { versionResolver: () => Promise.resolve(null) } })

    const error = await builder.run().catch((thrown: unknown) => thrown)

    expect(error).toEqual(new Error('Incorrect config: No files and refs'))
    expect(error).not.toBeInstanceOf(NotificationsError)
  })
})
