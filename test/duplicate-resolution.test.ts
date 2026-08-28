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
import { Editor, LocalRegistry } from './helpers'
import { setReportingDuplicate } from '../src/utils'
import { BUILD_TYPE, MESSAGE_CATEGORY, MESSAGE_SEVERITY, VERSION_STATUS } from '../src/consts'
import { BuildConfig, BuildResult, MessageSeverity } from '../src/types'

/*
 * Two or more documents claiming one id — the design's `Duplicate resolution`, in one file.
 *
 * Which claimant is indexed, what each of them is told, and when the answer must not depend on the order the
 * config listed them in. The severity a collision carries is decided per pair, so a document is graded by the
 * worst collision it is actually in; grading the whole claimant set at once lets a mild claimant shield a
 * severe pair, and comparing each newcomer against a running winner never forms the pair at all.
 *
 * What an `Error` then costs the document is `tolerant-publication.test.ts`; the category, severity and
 * release verdict of each duplicate diagnostic are rows in `notification-catalogue.test.ts`.
 */

/** The two REST documents that both derive `res-data-post` — the cross-document collision fixture. */
const publishContestedPair = (packageId = 'operationId-collisions/same-path-different-documents'): Promise<BuildResult> => {
  const pkg = LocalRegistry.openPackage('operationId-collisions/same-path-different-documents')
  return pkg.publish(pkg.packageId, {
    packageId,
    version: 'v1',
    files: [{ fileId: 'spec1.json' }, { fileId: 'spec2.json' }],
  })
}

describe('Duplicate resolution', () => {
  const entity = (documentId: string, title: string): { documentId: string; title: string } => ({ documentId, title })

  test('should keep the lexicographically smallest documentId, whichever arrives first', () => {
    const forwards = new Map<string, { documentId: string; title: string }>()
    setReportingDuplicate(forwards, 'id', entity('a', 'first'))
    setReportingDuplicate(forwards, 'id', entity('b', 'second'))

    const backwards = new Map<string, { documentId: string; title: string }>()
    setReportingDuplicate(backwards, 'id', entity('b', 'second'))
    setReportingDuplicate(backwards, 'id', entity('a', 'first'))

    expect(forwards.get('id')?.documentId).toBe('a')
    expect(backwards.get('id')?.documentId).toBe('a')
  })

  test('should let the same document refresh its own entry', () => {
    const map = new Map<string, { documentId: string; title: string }>()
    setReportingDuplicate(map, 'id', entity('a', 'before'))
    setReportingDuplicate(map, 'id', entity('a', 'after'))

    expect(map.get('id')?.title).toBe('after')
  })
})

// A document announces only what it owns in the published index: without this `documents.json` and
// `operations.json` contradict each other after a duplicate.
describe('What each document announces', () => {
  test('should not list on the losing document the id the winner owns', async () => {
    const result = await publishContestedPair()

    const winner = result.operations.get('res-data-post')
    expect(winner?.documentId).toBe('spec1')

    const documents = [...result.documents.values()]
    const owner = documents.find(({ slug }) => slug === 'spec1')
    const loser = documents.find(({ slug }) => slug === 'spec2')
    expect(owner?.operationIds).toContain('res-data-post')
    expect(loser?.operationIds).not.toContain('res-data-post')
  })
})

// The two duplicate cases are separate diagnostics: a collision inside one document is
// `rest-duplicate-operation`, reported once, and the cross-document handler must stay out of it — otherwise
// the text names the same document twice.
describe('Duplicate resolution tells the two cases apart', () => {
  test('should not report an intra-document collision as a cross-document duplicate', async () => {
    const pkg = LocalRegistry.openPackage('operationId-collisions/same-operationId-same-document')
    const result = await pkg.publish(pkg.packageId, {
      packageId: pkg.packageId,
      version: 'v1',
      status: VERSION_STATUS.DRAFT,
      files: [{ fileId: 'spec.json' }],
    })

    expect(result.notifications.map(({ category }) => category))
      .toContain(MESSAGE_CATEGORY.RestDuplicateOperation)
    expect(result.notifications.filter(({ category }) => category === MESSAGE_CATEGORY.DuplicateOperationId))
      .toEqual([])
    // the giveaway of the old behaviour: a message naming one document as two
    expect(result.notifications.every(({ message }) => !/'([^']+)' and '\1'/.test(message))).toBe(true)
  }, 30000)
})

// An incremental rebuild re-processes one document, not the set. The loser of a duplicate must not take the
// id back by being rebuilt on its own — the winner is still the smaller slug, and nothing rebuilt it.
describe('What each document announces, after an incremental rebuild', () => {
  // two documents claiming one operationId, then `update()` re-processing only the loser
  test('should leave the winner in place when the losing document is rebuilt alone', async () => {
    const packageId = 'operationId-collisions/same-path-different-documents'
    const files = [{ fileId: 'spec1.json' }, { fileId: 'spec2.json' }]
    const editor = new Editor(packageId, {
      packageId, version: 'v1', status: VERSION_STATUS.DRAFT, buildType: BUILD_TYPE.BUILD, files,
    } as BuildConfig, {}, LocalRegistry.openPackage(packageId))

    const built = await editor.run()
    const [contested] = [...built.operations.keys()]
    expect(built.operations.get(contested)?.documentId).toBe('spec1')

    const rebuilt = await editor.update({ packageId, version: 'v1', files } as BuildConfig, ['spec2.json'])

    expect(rebuilt.operations.get(contested)?.documentId).toBe('spec1')
    expect(rebuilt.documents.get('spec2.json')?.operationIds).toEqual([])
  }, 60000)
})

// Ownership can change after a document has been processed: a smaller slug arriving later takes the entry.
describe('What each document announces, whatever the config order', () => {
  test('should drop the id from the loser even when it was processed first', async () => {
    const pkg = LocalRegistry.openPackage('operationId-collisions/same-path-different-documents')
    const result = await pkg.publish(pkg.packageId, {
      packageId: pkg.packageId,
      version: 'v1',
      // reversed: spec2 is processed first and owns the id until spec1 takes it
      files: [{ fileId: 'spec2.json' }, { fileId: 'spec1.json' }],
    })

    expect(result.operations.get('res-data-post')?.documentId).toBe('spec1')

    const loser = [...result.documents.values()].find(({ slug }) => slug === 'spec2')
    expect(loser?.operationIds).not.toContain('res-data-post')
  })
})

describe('A duplicate id shared by two api types', () => {
  // `api.yaml` derives `pets-get` for GET /pets, and both AsyncAPI documents derive it from the `pets`
  // operation on the `pets` channel.
  const severitiesFor = async (packageId: string, fileIds: string[]): Promise<MessageSeverity[]> => {
    const result = await LocalRegistry.openPackage('tolerant-publication').publish('tolerant-publication', {
      packageId,
      version: 'v1',
      status: VERSION_STATUS.DRAFT,
      files: fileIds.map(fileId => ({ fileId })),
    })

    expect([...result.operations.keys()]).toEqual(['pets-get'])
    return result.notifications
      .filter(({ category }) => category === MESSAGE_CATEGORY.DuplicateOperationId)
      .map(({ severity }) => severity)
  }

  // `config.files` order decides which document is processed second; it must not decide whether the release
  // is refused. The REST side is staged at `Warning` until the published population is clean, so a mixed pair
  // reports at `Warning` whichever way round the two arrive.
  test('should keep the same severity whichever document is processed first', async () => {
    const restFirst = await severitiesFor('duplicate-severity/rest-first', ['api.yaml', 'async-a.yaml'])
    const asyncFirst = await severitiesFor('duplicate-severity/async-first', ['async-a.yaml', 'api.yaml'])

    expect(restFirst).toEqual([MESSAGE_SEVERITY.Warning, MESSAGE_SEVERITY.Warning])
    expect(asyncFirst).toEqual(restFirst)
  }, 60000)

  // and the AsyncAPI pair grades its own collision an `Error`
  test('should report a collision between two AsyncAPI documents as an Error', async () => {
    const severities = await severitiesFor('duplicate-severity/async-only', ['async-a.yaml', 'async-b.yaml'])

    expect(severities).toEqual([MESSAGE_SEVERITY.Error, MESSAGE_SEVERITY.Error])
  }, 60000)
})

describe('A collision three documents share', () => {
  // Three documents deriving one id: REST against AsyncAPI is a `Warning`, AsyncAPI against AsyncAPI an
  // `Error`. Each document is graded by the worst collision it is in, so the REST document sorting first
  // does not make the pair behind it a `Warning`.
  test('should grade a collision by the worst pair in it, not by whoever claimed the id first', async () => {
    const result = await LocalRegistry.openPackage('tolerant-publication').publish('tolerant-publication', {
      packageId: 'tolerant-publication/three-claimants',
      status: VERSION_STATUS.DRAFT,
      files: [{ fileId: 'api.yaml' }, { fileId: 'async-a.yaml' }, { fileId: 'async-b.yaml' }],
    })

    const severityOf = (slug: string): number | undefined =>
      result.notifications.find(({ documentId }) => documentId === slug)?.severity

    // the REST document keeps the staged Warning; the AsyncAPI pair is graded on its own collision
    expect(severityOf('api')).toBe(MESSAGE_SEVERITY.Warning)
    expect(severityOf('async-a')).toBe(MESSAGE_SEVERITY.Error)
    expect(severityOf('async-b')).toBe(MESSAGE_SEVERITY.Error)

    // and the message names every claimant, not the pair that happened to be compared
    const [{ message }] = result.notifications
    for (const slug of ['api', 'async-a', 'async-b']) { expect(message).toContain(slug) }
  }, 30000)
})

/*
 * The invariant every bug in this area broke, stated once and checked over the fixtures that exercise it:
 *
 *   the index and the documents agree — every id a document announces is in the index and attributed back to
 *   it, and every entry in the index is announced by the document that owns it.
 *
 * Each defect we found violated one half or the other: a document announcing an id the version dropped, or an
 * index entry no document claimed.
 */
describe('The index and the documents agree', () => {
  const FIXTURES: Array<[string, string[]]> = [
    ['operationId-collisions/same-path-different-documents', ['spec1.json', 'spec2.json']],
    ['operationId-collisions/same-operationId-same-document', ['spec.json']],
    ['tolerant-publication', ['healthy.yaml', 'colliding.yaml']],
    ['tolerant-publication', ['api.yaml', 'async-a.yaml', 'async-b.yaml']],
  ]

  test.each(FIXTURES)('holds for %s %p', async (project, fileIds) => {
    const registry = LocalRegistry.openPackage(project)
    const result = await registry.publish(project, {
      packageId: `agreement/${project}/${fileIds.join('-')}`,
      version: 'v1',
      status: VERSION_STATUS.DRAFT,
      files: fileIds.map(fileId => ({ fileId })),
    })

    const announced = new Map<string, string>()
    for (const document of result.documents.values()) {
      for (const operationId of document.operationIds ?? []) {
        expect(announced.has(operationId)).toBe(false)
        announced.set(operationId, document.slug)
      }
    }

    for (const [operationId, slug] of announced) {
      expect(result.operations.get(operationId)?.documentId).toBe(slug)
    }
    for (const [operationId, operation] of result.operations) {
      expect(announced.get(operationId)).toBe(operation.documentId)
    }
  }, 60000)
})

/*
 * The editor's incremental rebuild answers the same question as a publication, and must answer it the same
 * way: it grades a collision from what every document remembers deriving, not against whichever claimant
 * holds the index. Graded pairwise it reported a `Warning` where the publication reports an `Error`, so the
 * preview called a version publishable that the release gate refuses.
 */
describe('The editor preview agrees with the publication', () => {
  test('should grade a three-document collision the way a publication does', async () => {
    const files = [{ fileId: 'api.yaml' }, { fileId: 'async-a.yaml' }, { fileId: 'async-b.yaml' }]
    const registry = LocalRegistry.openPackage('tolerant-publication')

    const published = await registry.publish('tolerant-publication', {
      packageId: 'agreement/published', version: 'v1', status: VERSION_STATUS.DRAFT, files,
    })

    const editor = new Editor('tolerant-publication', {
      packageId: 'agreement/previewed',
      version: 'v1',
      status: VERSION_STATUS.DRAFT,
      buildType: BUILD_TYPE.BUILD,
      files,
    } as BuildConfig, {}, registry)
    await editor.run()
    const rebuilt = await editor.update(
      { packageId: 'agreement/previewed', version: 'v1', files } as BuildConfig,
      ['async-b.yaml'],
    )

    const graded = (notifications: Array<{ documentId?: string; severity: number }>): string[] =>
      notifications.map(({ documentId, severity }) => `${documentId}/${severity}`).sort()

    expect(graded(rebuilt.notifications)).toEqual(graded(published.notifications))
  }, 90000)
})

// MCP entity ids collide across documents the same way operation ids do, and the preview must grade them the
// same way a publication does: rebuilding an unrelated file must not clear a collision between two others.
describe('The editor preview agrees with the publication for MCP', () => {
  const MCP_ENDPOINT = '/mcp'
  const mcpFiles = [
    { fileId: 'init.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
    { fileId: 'tools-same-name.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
    { fileId: 'tools-same-name-2.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
  ]

  test('should keep a collision reported when an unrelated document is rebuilt', async () => {
    const config = {
      packageId: 'agreement/mcp-preview',
      version: 'v1',
      status: VERSION_STATUS.DRAFT,
      buildType: BUILD_TYPE.BUILD,
      files: mcpFiles,
    } as unknown as BuildConfig

    const editor = new Editor('mcp-build', config, {}, LocalRegistry.openPackage('mcp-build'))
    const built = await editor.run()
    const rebuilt = await editor.update(config, ['init.json'])

    const collisions = (notifications: Array<{ category: string; documentId?: string }>): Array<string | undefined> =>
      notifications
        .filter(({ category }) => category === MESSAGE_CATEGORY.McpDuplicateEntity)
        .map(({ documentId }) => documentId)
        .sort()

    expect(collisions(built.notifications)).toEqual(['tools-same-name', 'tools-same-name-2'])
    expect(collisions(rebuilt.notifications)).toEqual(collisions(built.notifications))
  }, 90000)
})

