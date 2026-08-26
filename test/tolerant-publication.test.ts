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

import { afterEach, describe, expect, jest, test } from '@jest/globals'
import JSZip from 'jszip'
import { Editor, loadFileAsStringFromRegistry, LocalRegistry, VERSIONS_PATH, notificationMatcher, notificationsMatcher } from './helpers'
import { BUILD_TYPE, MESSAGE_CATEGORY, MESSAGE_SEVERITY, PACKAGE, VERSION_STATUS } from '../src/consts'
import { restApiBuilder, unknownApiBuilder } from '../src/apitypes'

// The scenario the whole story exists for: one broken document must not cost the version the documents that
// built cleanly. Everything else in the suite tests a single catch point; this tests the promise.
describe('Tolerant publication end to end', () => {
  test('should keep the version its REST operations when an AsyncAPI document is broken', async () => {
    const pkg = LocalRegistry.openPackage('tolerant-publication')
    // draft: a broken document blocks a release by design — release-gate.test.ts covers that half
    const result = await pkg.publish(pkg.packageId, { status: VERSION_STATUS.DRAFT })

    // the healthy document is fully published
    const rest = result.documents.get('rest.json')
    expect(rest).toBeDefined()
    expect(result.operations.size).toBeGreaterThan(0)
    expect([...result.operations.values()].every(({ documentId }) => documentId === rest!.slug)).toBe(true)

    // the broken one is published too — visible, downloadable, and empty of operations
    const broken = result.documents.get('broken-async.yaml')
    expect(broken).toBeDefined()
    expect(broken!.source).toBeDefined()
    expect(broken!.operationIds).toEqual([])

    // and only it is blamed
    const errors = result.notifications.filter(({ severity }) => severity === MESSAGE_SEVERITY.Error)
    expect(errors.length).toBeGreaterThan(0)
    expect([...new Set(errors.map(({ documentId }) => documentId))]).toEqual([broken!.slug])
  })

  test('should carry both documents in the archive, the broken one with its original bytes', async () => {
    const pkg = LocalRegistry.openPackage('tolerant-publication')
    await pkg.publish(pkg.packageId, { status: VERSION_STATUS.DRAFT })

    const documents = JSON.parse(
      (await loadFileAsStringFromRegistry(VERSIONS_PATH, 'tolerant-publication/v1', 'documents.json'))!,
    ).documents as Array<{ fileId: string; slug: string; filename: string }>

    expect(documents.map(({ fileId }) => fileId).sort()).toEqual(['broken-async.yaml', 'rest.json'])

    const broken = documents.find(({ fileId }) => fileId === 'broken-async.yaml')!
    const raw = await loadFileAsStringFromRegistry(VERSIONS_PATH, 'tolerant-publication/v1/documents', broken.filename)
    expect(raw).toContain('asyncapi')
  }, 30000)
})

// Two catch points the rest of the suite reaches only indirectly. Both are `Error`, so both block a release —
// and both must leave the build standing, which is the whole promise.
describe('Catch points report instead of aborting', () => {
  afterEach(() => { jest.restoreAllMocks() })

  // one healthy file and one the resolver has nothing for
  test('should report a file the resolver cannot produce and keep building the rest', async () => {
    const pkg = LocalRegistry.openPackage('tolerant-publication')
    const result = await pkg.publish(pkg.packageId, {
      status: VERSION_STATUS.DRAFT,
      files: [{ fileId: 'rest.json' }, { fileId: 'no-such-file.yaml' }],
    })

    expect(result).toEqual(notificationsMatcher([
      notificationMatcher(MESSAGE_SEVERITY.Error, 'File was not parsed', {
        category: MESSAGE_CATEGORY.FileNotParsed,
        documentId: 'no-such-file',
      }),
    ]))
    // the healthy document still built
    expect(result.operations.size).toBeGreaterThan(0)
  }, 30000)

  // The placeholder has to carry the failed file's bytes. `parser.test.ts` proves it when the parser is what
  // failed; this covers the other route, where parsing succeeded and the document build threw, because the
  // placeholder is built from a different call there.
  test('should keep the original bytes when the document build itself throws', async () => {
    jest.spyOn(unknownApiBuilder, 'buildDocument').mockImplementation(() => {
      throw new Error('build exploded')
    })

    const pkg = LocalRegistry.openPackage('tolerant-publication')
    const result = await pkg.publish(pkg.packageId, {
      status: VERSION_STATUS.DRAFT,
      files: [{ fileId: 'broken-async.yaml' }],
    })

    const [document] = [...result.documents.values()]
    expect(document.source).toBeDefined()
    expect(await document.source!.text()).toContain('asyncapi')
  }, 30000)

  // The build failure and the parse complaints are independent diagnostics, and this is the only site that
  // emits the second kind. A build that threw is exactly when the reader needs both.
  test('should keep the parse errors of a document whose build threw', async () => {
    jest.spyOn(restApiBuilder, 'buildDocument').mockImplementation(() => {
      throw new Error('build exploded')
    })

    const packageId = 'reference-bundling/shared-broken-reference'
    const result = await new LocalRegistry(packageId).publish(packageId, {
      packageId,
      version: 'v1',
      status: VERSION_STATUS.DRAFT,
      files: [{ fileId: 'shared.yaml' }],
    })

    const categories = result.notifications.map(({ category }) => category)
    expect(categories).toContain(MESSAGE_CATEGORY.BuildDocument)
    expect(categories).toContain(MESSAGE_CATEGORY.InvalidTextFile)
    expect(result.notifications.every(({ documentId }) => documentId === 'shared')).toBe(true)
  }, 30000)

  // the api type's operation builder throws for the healthy REST document
  test('should report a document whose operations fail to build and keep the version', async () => {
    jest.spyOn(restApiBuilder, 'buildOperations').mockImplementation(() => {
      throw new Error('operations exploded')
    })

    const pkg = LocalRegistry.openPackage('tolerant-publication')
    const result = await pkg.publish(pkg.packageId, { status: VERSION_STATUS.DRAFT })

    const failure = result.notifications.find(({ category }) => category === MESSAGE_CATEGORY.BuildOperations)
    expect(failure).toMatchObject({
      severity: MESSAGE_SEVERITY.Error,
      message: expect.stringContaining('operations exploded'),
      documentId: 'rest',
    })
    // the throw cost the document its operations, not the version its documents
    expect(result.documents.size).toBeGreaterThan(0)
  }, 30000)
})

// The flags say what is marked; they are derived from the notification lists, one stream each.
describe('hasErrors flags', () => {
  // one healthy REST document beside a broken AsyncAPI one
  test('should flag the version and the broken document, but not the healthy one', async () => {
    // its own package id: this project is published by several suites, and the version directory is shared
    const packageId = 'tolerant-publication/flags'
    await LocalRegistry.openPackage('tolerant-publication')
      .publish('tolerant-publication', { packageId, status: VERSION_STATUS.DRAFT })

    const info = JSON.parse((await loadFileAsStringFromRegistry(VERSIONS_PATH, `${packageId}/v1`, 'info.json'))!)
    expect(info.hasErrors).toBe(true)

    const documents = JSON.parse(
      (await loadFileAsStringFromRegistry(VERSIONS_PATH, `${packageId}/v1`, 'documents.json'))!,
    ).documents as Array<{ fileId: string; hasErrors?: boolean }>

    expect(documents.find(({ fileId }) => fileId === 'broken-async.yaml')?.hasErrors).toBe(true)
    // absent rather than false: the field is optional and defaults to false for every consumer
    expect(documents.find(({ fileId }) => fileId === 'rest.json')).not.toHaveProperty('hasErrors')
  }, 30000)

  test('should flag nothing on a clean build', async () => {
    const pkg = LocalRegistry.openPackage('reference-bundling/case1')
    await pkg.publish(pkg.packageId)

    const info = JSON.parse((await loadFileAsStringFromRegistry(VERSIONS_PATH, 'reference-bundling/case1/v1', 'info.json'))!)
    expect(info).not.toHaveProperty('hasErrors')

    const documents = JSON.parse(
      (await loadFileAsStringFromRegistry(VERSIONS_PATH, 'reference-bundling/case1/v1', 'documents.json'))!,
    ).documents as Array<{ hasErrors?: boolean }>
    expect(documents.length).toBeGreaterThan(0)
    expect(documents.every(document => !('hasErrors' in document))).toBe(true)
  }, 30000)
})

// The regression half of the story: a version that builds cleanly must come out of this change exactly as it
// went in. Everything new is either absent or empty, and nothing new leaks into the pre-existing files.
describe('A clean build is unchanged', () => {
  const PACKAGE_ID = 'declarative-changes-in-rest-operation/case1'

  const buildCleanChangelog = async (): Promise<Editor> => {
    const registry = new LocalRegistry(PACKAGE_ID)
    await registry.publish(PACKAGE_ID, { packageId: PACKAGE_ID, version: 'v1', files: [{ fileId: 'before.yaml', publish: true }] })
    await registry.publish(PACKAGE_ID, { packageId: PACKAGE_ID, version: 'v2', files: [{ fileId: 'after.yaml' }] })

    const editor = new Editor(PACKAGE_ID, {
      packageId: PACKAGE_ID,
      version: 'v2',
      previousVersionPackageId: PACKAGE_ID,
      previousVersion: 'v1',
      buildType: BUILD_TYPE.CHANGELOG,
      status: VERSION_STATUS.RELEASE,
    } as never, {}, registry)
    await editor.run()
    return editor
  }

  test('should keep the build stream silent and still compute the comparison', async () => {
    const editor = await buildCleanChangelog()
    const { notifications, comparisons } = editor.builder.buildResult

    expect(notifications).toEqual([])
    // a clean build is not an empty one
    expect(comparisons.length).toBeGreaterThan(0)
    expect(comparisons.every(comparison => comparison.notifications.length === 0)).toBe(true)
    expect(comparisons.some(comparison => comparison.hasErrors)).toBe(false)
  }, 30000)

  test('should add no error fields and write empty comparison rows rather than skipping them', async () => {
    const editor = await buildCleanChangelog()
    const zip = await JSZip.loadAsync(await editor.createVersionPackage())
    const read = async <T>(name: string): Promise<T> =>
      JSON.parse(await zip.file(name)!.async('string')) as T

    const { comparisons } = await read<{ comparisons: Array<Record<string, unknown>> }>(PACKAGE.COMPARISONS_FILE_NAME)
    expect(comparisons.length).toBeGreaterThan(0)
    // `notifications` belongs to its own file; `hasErrors` is written only when something is wrong
    expect(comparisons.every(comparison => !('notifications' in comparison) && !('hasErrors' in comparison))).toBe(true)

    // an entry with an empty array, not a missing entry: a reader must never have to tell "no messages" from
    // "not written", and every pair calculated here is written
    const comparisonNotifications = await read<{ comparisons: Array<{ notifications: unknown[] }> }>(
      PACKAGE.COMPARISON_NOTIFICATIONS_FILE_NAME,
    )
    expect(comparisonNotifications.comparisons.length).toBe(comparisons.length)
    expect(comparisonNotifications.comparisons.every(({ notifications }) => notifications.length === 0)).toBe(true)

    const { notifications } = await read<{ notifications: unknown[] }>(PACKAGE.NOTIFICATIONS_FILE_NAME)
    expect(notifications).toEqual([])
  }, 30000)
})
