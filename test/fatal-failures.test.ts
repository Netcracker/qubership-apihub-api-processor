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
import { ASYNCAPI_API_TYPE, BUILD_TYPE, GRAPHQL_API_TYPE, REST_API_TYPE, VERSION_STATUS } from '../src/consts'
import { AdmZipTool } from '../src/components/adm-zip-tool'
import { compareVersionsDdl } from '../src/components/compare/compare.ddl'
import { compareDocuments as compareRestDocuments } from '../src/apitypes/rest/rest.changes'
import { compareDocuments as compareGraphqlDocuments } from '../src/apitypes/graphql/graphql.changes'
import { compareDocuments as compareAsyncDocuments } from '../src/apitypes/async/async.changes'
import {
  BuildConfigFile,
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
