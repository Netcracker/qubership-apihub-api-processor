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
import {
  ANY_ASYNCAPI_CHANGE,
  ANY_DDL_SPEC,
  ANY_GRAPHQL_CHANGE,
  ANY_REST_CHANGE,
  ANY_REST_SPEC,
  buildWithVersionOverrides,
  contentEditor,
  DocumentChange,
  Editor,
  LocalRegistry,
  prepareChangelogFromContent,
  publishChangeFromContent,
} from './helpers'
import {
  ASYNCAPI_API_TYPE,
  BUILD_TYPE,
  GRAPHQL_API_TYPE,
  MESSAGE_CATEGORY,
  REST_API_TYPE,
  VERSION_STATUS,
} from '../src/consts'
import { AdmZipTool } from '../src/components/adm-zip-tool'
import { compareVersionsDdl } from '../src/components/compare/compare.ddl'
import { compareDocuments as compareRestDocuments } from '../src/apitypes/rest/rest.changes'
import { compareDocuments as compareGraphqlDocuments } from '../src/apitypes/graphql/graphql.changes'
import { compareDocuments as compareAsyncDocuments } from '../src/apitypes/async/async.changes'
import {
  BuildType,
  CompareOperationsPairContext,
  DocumentsCompare,
  OperationsApiType,
  VersionStatus,
} from '../src/types'
import { PackageVersionBuilder } from '../src/processor'

// The other half of tolerant publication: the problems that still abort the build. Every case here used to
// throw and must keep throwing — a notification instead would either publish nothing useful or bury a
// deployment defect that is untraceable afterwards.

const BEFORE = 'v1'
const AFTER = 'v2'

// a build that lists no files, for the checks on the config itself
const configOnlyEditor = (): Editor => contentEditor({ packageId: 'fatal-failures/config-only', version: BEFORE }, {})

/**
 * Publish a before/after pair and compare the two documents against an empty operation index. The index is built
 * by the caller of `compareDocuments`, so an empty one is exactly the internal inconsistency the throw guards: the
 * pair has a changed operation, and the index that drives the comparison does not know it.
 */
async function compareAgainstEmptyIndex(
  packageId: string,
  apiType: OperationsApiType,
  extension: string,
  change: DocumentChange,
  compareDocuments: DocumentsCompare,
): Promise<unknown> {
  const registry = await publishChangeFromContent(packageId, change, { extension })

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
      'fatal-failures/empty-index-rest',
      REST_API_TYPE,
      'yaml',
      ANY_REST_CHANGE,
      compareRestDocuments,
    )).rejects.toThrow(/Can't find the .* operation from documents pair/)
  }, 30000)

  test('should stay fatal for graphql', async () => {
    await expect(compareAgainstEmptyIndex(
      'fatal-failures/empty-index-graphql',
      GRAPHQL_API_TYPE,
      'gql',
      ANY_GRAPHQL_CHANGE,
      compareGraphqlDocuments,
    )).rejects.toThrow(/Can't find the .* operation from documents pair/)
  }, 30000)

  test('should stay fatal for asyncapi', async () => {
    await expect(compareAgainstEmptyIndex(
      'fatal-failures/empty-index-asyncapi',
      ASYNCAPI_API_TYPE,
      'yaml',
      ANY_ASYNCAPI_CHANGE,
      compareAsyncDocuments,
    )).rejects.toThrow(/Can't find the .* operation from documents pair/)
  }, 30000)
})

describe('A missing DDL compare hook aborts the comparison', () => {
  test('should stay fatal when DDL documents have no compareDdlDocuments registered', async () => {
    const packageId = 'fatal-failures/ddl'
    const registry = new LocalRegistry(packageId)
    for (const version of [BEFORE, AFTER]) {
      await registry.publishFromContent(
        { 'widgets.sql': ANY_DDL_SPEC },
        { packageId, version, files: [{ fileId: 'widgets.sql' }] },
      )
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
    const editor = configOnlyEditor()
    await expect(editor.run({ version: BEFORE, buildType: BUILD_TYPE.BUILD, files: [], refs: [] }))
      .rejects.toThrow(/Got no files and refs/)
  })

  // A changelog is the comparison and nothing else: with no baseline there is nothing to compute, so this
  // fails before any work rather than publishing an empty changelog with no explanation.
  test('should reject a changelog build with no previousVersion', async () => {
    const editor = configOnlyEditor()
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
    const editor = configOnlyEditor()
    await expect(editor.run({
      version: AFTER,
      buildType: BUILD_TYPE.PREFIX_GROUPS_CHANGELOG,
      previousVersion: undefined,
    } as never)).resolves.toBeDefined()
  })

  test('should accept a changelog that has a baseline', async () => {
    const editor = await prepareChangelogFromContent('fatal-failures/changelog-with-baseline', ANY_REST_CHANGE)

    await expect(editor.run({ status: VERSION_STATUS.DRAFT })).resolves.toBeDefined()
  }, 30000)
})

// A host that wires no resolver has a deployment defect, not a content one: it breaks identically for every
// build, so a notification would only bury it.
describe('A missing host resolver aborts the build', () => {
  test('should stay fatal for a changelog with no versionResolver', async () => {
    const builder = new PackageVersionBuilder({
      packageId: 'fatal-failures/no-version-resolver',
      version: AFTER,
      previousVersionPackageId: 'fatal-failures/no-version-resolver',
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
    const editor = contentEditor(
      { packageId: 'fatal-failures/packaging', version: BEFORE, status: VERSION_STATUS.DRAFT },
      { 'before.yaml': ANY_REST_SPEC },
    )
    // the archive is written whether or not the content was built, and a file that failed to resolve still
    // leaves a document behind, so the operation is what shows the content was read
    expect((await editor.run()).operations.size).toBe(1)

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
