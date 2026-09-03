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
import { loadFileAsStringFromRegistry, LocalRegistry, notificationMatcher, notificationsMatcher, VERSIONS_PATH } from './helpers'
import { MESSAGE_CATEGORY, MESSAGE_SEVERITY, VERSION_STATUS } from '../src/consts'
import { restApiBuilder, unknownApiBuilder } from '../src/apitypes'
import * as restOperation from '../src/apitypes/rest/rest.operation'

/*
 * A document that could not be built is still published — the design's `Error documents must carry their
 * source`.
 *
 * Every failure on the way to a document reports instead of throwing, and whatever it leaves behind has to
 * survive packaging: the original bytes are the troubleshooting artifact, and a sourceless document must not
 * take the archive down with it.
 *
 * What such a document costs the version is `tolerant-publication.test.ts`; the category and severity of each
 * failure are rows in `notification-catalogue.test.ts`.
 */

describe('Error documents survive packaging', () => {
  test('a version whose only document fails to parse still produces a complete archive', async () => {
    const registry = LocalRegistry.openPackage('broken')
    const result = await registry.publish('broken', {
      packageId: 'broken',
      version: 'v1',
      status: VERSION_STATUS.DRAFT,
      files: [{ fileId: 'missing_brace.json', publish: true }],
    })

    const document = result.documents.get('missing_brace.json')
    expect(document).toBeDefined()

    const documents = JSON.parse((await loadFileAsStringFromRegistry(VERSIONS_PATH, 'broken/v1', 'documents.json'))!)
    expect(documents.documents.map(({ fileId }: { fileId: string }) => fileId)).toEqual(['missing_brace.json'])

    // the archive carries the broken file itself — that is the troubleshooting artifact
    const raw = await loadFileAsStringFromRegistry(VERSIONS_PATH, 'broken/v1/documents', document!.filename)
    expect(raw).toBeTruthy()
    expect(raw).toContain('openapi')
  }, 30000)
})

// The other flavour of error document: nothing was ever fetched, so there are no bytes to carry. It is still
// published — a document missing from the archive would leave the failure invisible to anyone browsing the
// version — and the entry it ships is empty.
describe('A document whose file could not be fetched', () => {
  // a version of two files, one of which the resolver cannot produce
  test('should publish an empty entry rather than skip the document or fail packaging', async () => {
    const project = 'tolerant-publication'
    // its own package id: the version directory is shared state, and other suites publish this project too
    const packageId = 'tolerant-publication/unfetchable-file'
    const result = await LocalRegistry.openPackage(project).publish(project, {
      packageId,
      version: 'v1',
      status: VERSION_STATUS.DRAFT,
      files: [{ fileId: 'rest.json' }, { fileId: 'no-such-file.yaml' }],
    })

    const document = result.documents.get('no-such-file.yaml')
    expect(document).toBeDefined()
    expect(document!.source).toBeUndefined()

    const documents = JSON.parse((await loadFileAsStringFromRegistry(VERSIONS_PATH, `${packageId}/v1`, 'documents.json'))!)
    expect(documents.documents.map(({ fileId }: { fileId: string }) => fileId)).toContain('no-such-file.yaml')

    const raw = await loadFileAsStringFromRegistry(VERSIONS_PATH, `${packageId}/v1/documents`, document!.filename)
    expect(raw).toBe('')
  }, 30000)
})

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

// The catch above the whole document is the outer of two. This one is per item: an operation the builder
// cannot produce is dropped on its own, and the document keeps everything else it built. The failed item also
// never reaches the intra-document duplicate check — an operationId nothing was built for cannot collide.
describe('An item that fails costs the document only that item', () => {
  afterEach(() => { jest.restoreAllMocks() })

  const throwFor = (predicate: (path: string) => boolean): void => {
    const build = restOperation.buildRestOperation
    jest.spyOn(restOperation, 'buildRestOperation').mockImplementation((...args) => {
      if (predicate(args[1])) { throw new Error('operation exploded') }
      return build(...args)
    })
  }

  test('should keep the operations of a document one of whose operations failed', async () => {
    throwFor(path => path === '/api/v1/resource')

    const pkg = LocalRegistry.openPackage('operationId-collisions/same-operationId-same-document')
    const result = await pkg.publish(pkg.packageId, {
      packageId: 'per-item/rest',
      version: 'v1',
      status: VERSION_STATUS.DRAFT,
      files: [{ fileId: 'spec.json' }],
    })

    expect(result.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: MESSAGE_CATEGORY.BuildOperations,
        severity: MESSAGE_SEVERITY.Error,
        message: expect.stringContaining('operation GET /api/v1/resource'),
        documentId: 'spec',
      }),
    ]))
    // the sibling operation of the same document is still in the version
    expect([...result.operations.values()].map(({ operationId }) => operationId)).toEqual(['api-v1-resource-get'])
  }, 30000)

  test('should not count an operation that failed towards a duplicate operationId', async () => {
    throwFor(path => path === '/api/v1/resource')

    const pkg = LocalRegistry.openPackage('operationId-collisions/same-operationId-same-document')
    const result = await pkg.publish(pkg.packageId, {
      packageId: 'per-item/rest-duplicate',
      version: 'v1',
      status: VERSION_STATUS.DRAFT,
      files: [{ fileId: 'spec.json' }],
    })

    // both paths derive `api-v1-resource`, but only one operation was built, so nothing collides
    expect(result.notifications.map(({ category }) => category))
      .not.toContain(MESSAGE_CATEGORY.RestDuplicateOperation)
  }, 30000)
})

// A file the version will not publish is not part of it, so its own failures are dropped rather than moved to
// the version. A file reached through a `$ref` is a different case: `reference-bundling.test.ts` covers it,
// and there the message names the document that pulled the file in.
describe('A file that will not be published', () => {
  test('should drop its failure rather than report it against the version', async () => {
    const pkg = LocalRegistry.openPackage('tolerant-publication')
    const result = await pkg.publish(pkg.packageId, {
      packageId: 'error-documents/unpublished',
      status: VERSION_STATUS.DRAFT,
      files: [{ fileId: 'rest.json' }, { fileId: 'no-such-file.yaml', publish: false }],
    })

    // nothing is reported: the file is not part of the version, so its problems cost the version nothing
    expect(result.notifications).toEqual([])

    const published = [...result.documents.values()].filter(({ publish }) => publish)
    expect(published.map(({ slug }) => slug)).toEqual(['rest'])
  }, 30000)

  // and the same file as a release, where a version-level Error would have refused the publication
  test('should let a release publish over it', async () => {
    const pkg = LocalRegistry.openPackage('tolerant-publication')

    await expect(pkg.publish(pkg.packageId, {
      packageId: 'error-documents/unpublished-release',
      status: VERSION_STATUS.RELEASE,
      files: [{ fileId: 'rest.json' }, { fileId: 'no-such-file.yaml', publish: false }],
    })).resolves.toBeDefined()
  }, 30000)
})

