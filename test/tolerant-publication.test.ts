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

import { describe, expect, test } from '@jest/globals'
import JSZip from 'jszip'
import { Editor, loadFileAsStringFromRegistry, LocalRegistry, VERSIONS_PATH } from './helpers'
import { BUILD_TYPE, MESSAGE_CATEGORY, MESSAGE_SEVERITY, PACKAGE, VERSION_STATUS } from '../src/consts'
import { VALIDATION_RULES_SEVERITY_LEVEL_ERROR } from '../src'
import { BuildConfig, BuildResult } from '../src/types'

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
// Tolerance is per document and stops at the document: an `Error` marks it, and the version still publishes
// whatever it managed to build. The notification says what is wrong; the operations that are right stay
// readable, which is what a draft published for troubleshooting is for.
describe('A document an Error names still publishes what it built', () => {
  /** Publish the named fixtures of the `tolerant-publication` project as a draft, under their own version. */
  const publishDraft = (
    packageId: string,
    fileIds: string[],
    config: Partial<BuildConfig> = {},
  ): Promise<BuildResult> =>
    LocalRegistry.openPackage('tolerant-publication').publish('tolerant-publication', {
      packageId,
      status: VERSION_STATUS.DRAFT,
      files: fileIds.map(fileId => ({ fileId })),
      ...config,
    })

  // `colliding` builds `pets-get` and claims nothing: the index is filled after the loop, from the documents
  // that survived it, so the healthy document keeps the id they both built. Neither half of that shows up in
  // a fixture with one problem in one document.
  test('should publish what the flagged document built, and flag it', async () => {
    const packageId = 'tolerant-publication/mixed'
    const result = await publishDraft(packageId, ['healthy.yaml', 'colliding.yaml'])

    const healthy = result.documents.get('healthy.yaml')!
    const colliding = result.documents.get('colliding.yaml')!

    // the flagged document keeps what it built, contested id included: `colliding` sorts first
    expect(colliding.operationIds).toContain('pets-get')
    expect(colliding.operationIds!.length).toBeGreaterThan(1)
    expect(colliding.source).toBeDefined()
    expect(result.operations.get('pets-get')!.documentId).toBe(colliding.slug)
    // and the loser announces nothing it did not win
    expect(healthy.operationIds).toEqual([])

    // and it is the only one blamed, for its own collision
    expect(result.notifications.map(({ category }) => category)).toContain(MESSAGE_CATEGORY.RestDuplicateOperation)
    const errors = result.notifications.filter(({ severity }) => severity === MESSAGE_SEVERITY.Error)
    expect([...new Set(errors.map(({ documentId }) => documentId))]).toEqual([colliding.slug])

    // the archive says the same: marked, and still carrying its operations
    const documents = JSON.parse(
      (await loadFileAsStringFromRegistry(VERSIONS_PATH, `${packageId}/v1`, 'documents.json'))!,
    ).documents as Array<{ fileId: string; hasErrors?: boolean; operationIds: string[] }>

    const flagged = documents.find(({ fileId }) => fileId === 'colliding.yaml')!
    expect(flagged.hasErrors).toBe(true)
    expect(flagged.operationIds.length).toBeGreaterThan(1)

    const operations = JSON.parse(
      (await loadFileAsStringFromRegistry(VERSIONS_PATH, `${packageId}/v1`, 'operations.json'))!,
    ).operations as Array<{ operationId: string; documentId: string }>
    expect(operations.every(({ documentId }) => documentId === 'colliding')).toBe(true)
    expect(operations.length).toBeGreaterThan(1)
  }, 30000)

  // Three documents deriving one id: the AsyncAPI pair grades its own collision an `Error`, the REST document
  // a `Warning`. The flags differ, the ownership rule does not — the smallest slug keeps the id.
  test('should give a contested id to the smallest slug, whatever its claimants are flagged with', async () => {
    const result = await publishDraft('tolerant-publication/cross-type',
      ['async-a.yaml', 'async-b.yaml', 'healthy.yaml'])

    expect([...result.operations.keys()]).toEqual(['pets-get'])
    expect(result.operations.get('pets-get')!.documentId).toBe('async-a')
    expect(result.documents.get('async-a.yaml')!.operationIds).toEqual(['pets-get'])
    // the losers announce nothing they did not win, flagged or not
    expect(result.documents.get('healthy.yaml')!.operationIds).toEqual([])
    expect(result.documents.get('async-b.yaml')!.operationIds).toEqual([])
  }, 30000)

  // A document already carrying an Error is processed anyway, so one publication reports everything wrong
  // with it rather than one problem per republish.
  test('should keep looking for problems in a document already carrying one', async () => {
    const result = await publishDraft('tolerant-publication/two-problems', ['broken-ref.yaml'],
      { validationRulesSeverity: { brokenRefs: VALIDATION_RULES_SEVERITY_LEVEL_ERROR } })

    const categories = result.notifications.map(({ category }) => category)
    expect(categories).toContain(MESSAGE_CATEGORY.RefNotFound)
    expect(categories).toContain(MESSAGE_CATEGORY.DoubleSlashPath)
    // and what it could build is published
    expect(result.operations.size).toBeGreaterThan(0)
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

  test('should flag nothing when a document only carries a Warning', async () => {
    const packageId = 'tolerant-publication/warning-only'
    const pkg = LocalRegistry.openPackage('operationId-collisions/double-slash-in-path')
    const result = await pkg.publish(pkg.packageId, {
      packageId,
      version: 'v1',
      status: VERSION_STATUS.DRAFT,
      files: [{ fileId: 'spec.json' }],
    })

    expect(result.notifications.length).toBeGreaterThan(0)
    expect(result.notifications.every(({ severity }) => severity === MESSAGE_SEVERITY.Warning)).toBe(true)

    const info = JSON.parse((await loadFileAsStringFromRegistry(VERSIONS_PATH, `${packageId}/v1`, 'info.json'))!)
    expect(info).not.toHaveProperty('hasErrors')

    const documents = JSON.parse(
      (await loadFileAsStringFromRegistry(VERSIONS_PATH, `${packageId}/v1`, 'documents.json'))!,
    ).documents as Array<{ hasErrors?: boolean }>
    expect(documents.every(document => !('hasErrors' in document))).toBe(true)
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

    // and the build stream ships no file at all: this is a changelog, which has no documents of its own
    expect(zip.file(PACKAGE.NOTIFICATIONS_FILE_NAME)).toBeNull()
  }, 30000)
})
