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
import { Editor, LocalRegistry } from './helpers'
import { BUILD_TYPE, MESSAGE_CATEGORY, MESSAGE_SEVERITY, VERSION_STATUS } from '../src/consts'
import * as transformToDto from '../src/utils/transformToDto'
import { toVersionsComparisonDto } from '../src/utils/transformToDto'
import { NotificationMessage } from '../src/types/package/notifications'
import { assertReleaseIsPublishable } from '../src/components/release-gate'

const error = (message: string, documentId?: string): NotificationMessage => ({
  category: MESSAGE_CATEGORY.BuildDocument,
  severity: MESSAGE_SEVERITY.Error,
  message,
  ...documentId ? { documentId } : {},
})

const warning = (message: string): NotificationMessage => ({
  category: MESSAGE_CATEGORY.DoubleSlashPath,
  severity: MESSAGE_SEVERITY.Warning,
  message,
})

const gate = (status: string, build: NotificationMessage[], changelog: NotificationMessage[] = []): () => void =>
  () => assertReleaseIsPublishable(status, build, changelog)

const HINT = 'You can publish version in draft status for troubleshooting'

describe('Release gate', () => {
  test('should let a draft publish whatever the errors are', () => {
    expect(gate(VERSION_STATUS.DRAFT, [error('broken', 'petstore')], [error('bad changelog')])).not.toThrow()
  })

  test('should not block a release on warnings alone', () => {
    expect(gate(VERSION_STATUS.RELEASE, [warning('double slash')], [warning('risky')])).not.toThrow()
  })

  describe('the message names the specific problem', () => {
    test('should report a single attributed error with its document and the hint', () => {
      expect(gate(VERSION_STATUS.RELEASE, [error('Duplicated operationId', 'orders')]))
        .toThrow(`Duplicated operationId (document: orders). ${HINT}`)
    })

    test('should report a single unattributed error without the document clause', () => {
      expect(gate(VERSION_STATUS.RELEASE, [], [error('No such version')]))
        .toThrow(`No such version. ${HINT}`)
    })

    test('should summarise several document errors with a distinct sorted slug list', () => {
      expect(gate(VERSION_STATUS.RELEASE, [error('a', 'orders'), error('b', 'billing'), error('c', 'orders')]))
        .toThrow(`Cannot publish version in release status: 3 critical errors in following documents: billing, orders. ${HINT}`)
    })

    test('should name the changelog share in a mixed failure', () => {
      expect(gate(VERSION_STATUS.RELEASE, [error('a', 'orders')], [error('b', 'billing'), error('c')]))
        .toThrow(`Cannot publish version in release status: 3 critical errors in following documents: billing, orders, including 2 changelog errors. ${HINT}`)
    })

    test('should give a changelog-only failure its own wording and no document list', () => {
      expect(gate(VERSION_STATUS.RELEASE, [], [error('a'), error('b')]))
        .toThrow(`Cannot publish version in release status: 2 critical errors in the changelog. ${HINT}`)
    })

    // a comparison error may name a document; the form still turns on which stream failed, not on whether
    // anything was attributed, or the wording reads "in these documents, all of them in the changelog"
    test('should keep the changelog-only wording when a comparison error names a document', () => {
      expect(gate(VERSION_STATUS.RELEASE, [], [error('a', 'orders'), error('b')]))
        .toThrow(`Cannot publish version in release status: 2 critical errors in the changelog. ${HINT}`)
    })
  })
})

// T3 names migration explicitly: it is gated on the same terms, and the one thing that lets a historical
// version through is that its config carries no `brokenRefs`, so broken references arrive as `Warning`.
describe('Release gate and migration builds', () => {
  const migrationConfig = (status: string): Record<string, unknown> => ({
    status,
    // api-processor never reads this field — the test states that absence of an exemption is deliberate
    migrationBuild: true,
  })

  test('should gate a migration release on the same terms as any other release', async () => {
    const asRelease = LocalRegistry.openPackage('tolerant-publication')
    await expect(asRelease.publish(asRelease.packageId, migrationConfig(VERSION_STATUS.RELEASE) as never))
      .rejects.toThrow(/You can publish version in draft status/)

    const asDraft = LocalRegistry.openPackage('tolerant-publication')
    const result = await asDraft.publish(asDraft.packageId, migrationConfig(VERSION_STATUS.DRAFT) as never)
    expect(result.notifications.some(({ severity }) => severity === MESSAGE_SEVERITY.Error)).toBe(true)
  }, 30000)

  test('should let a migration release through when its only problems are broken references', async () => {
    // no `validationRulesSeverity` in the config, which is what a migration build arrives with
    const pkg = LocalRegistry.openPackage('reference-bundling/case2')
    const result = await pkg.publish(pkg.packageId, migrationConfig(VERSION_STATUS.RELEASE) as never)

    const refProblems = result.notifications.filter(({ category }) => category.startsWith('ref-'))
    expect(refProblems.length).toBeGreaterThan(0)
    expect(refProblems.every(({ severity }) => severity === MESSAGE_SEVERITY.Warning)).toBe(true)
    // the build completed and nothing is flagged, so the historical version stays rebuildable
    expect(result.notifications.some(({ severity }) => severity === MESSAGE_SEVERITY.Error)).toBe(false)
  }, 30000)
})

// `comparison-serialization` is raised while the comparison DTOs are built, which happens after the gate in
// `BuildStrategy` has passed. Left there, a release would ship with `hasErrors` on the comparison — the one
// state the design says a release cannot be in.
describe('Release gate and a comparison that cannot be serialized', () => {
  afterEach(() => { jest.restoreAllMocks() })

  const buildAgainstPrevious = async (status: string, buildType: string = BUILD_TYPE.BUILD): Promise<Editor> => {
    const packageId = 'declarative-changes-in-rest-operation/case1'
    const registry = new LocalRegistry(packageId)
    await registry.publish(packageId, { packageId, version: 'v1', files: [{ fileId: 'before.yaml' }] })

    const editor = new Editor(packageId, {
      packageId,
      version: 'v2',
      previousVersion: 'v1',
      status,
      buildType,
      files: [{ fileId: 'after.yaml' }],
    } as never, {}, registry)
    await editor.run()
    return editor
  }

  const failSerialization = (): void => {
    const serialize = toVersionsComparisonDto
    jest.spyOn(transformToDto, 'toVersionsComparisonDto')
      .mockImplementation((comparison, cache, logError) => {
        logError('Add diff has undefined afterValueNormalized')
        return serialize(comparison, cache, logError)
      })
  }

  test('should fail a release when the comparison fails to serialize', async () => {
    const editor = await buildAgainstPrevious(VERSION_STATUS.RELEASE)
    failSerialization()

    await expect(editor.createNodeVersionPackage())
      .rejects.toThrow(/Add diff has undefined afterValueNormalized/)
  }, 30000)

  test('should let the same draft publish, flagged on the comparison', async () => {
    const editor = await buildAgainstPrevious(VERSION_STATUS.DRAFT)
    failSerialization()

    await expect(editor.createNodeVersionPackage()).resolves.toBeDefined()
  }, 30000)

  // A standalone changelog recalculates the changes of a version that is already published, so its `status`
  // describes that version rather than a publication being attempted. Gating it would make an unreliable
  // changelog unrecalculable — the gate belongs to the `build` type, and the packager checks `buildType`.
  test('should not gate a standalone changelog, whatever the status of the version it describes', async () => {
    const editor = await buildAgainstPrevious(VERSION_STATUS.RELEASE, BUILD_TYPE.CHANGELOG)
    failSerialization()

    await expect(editor.createNodeVersionPackage()).resolves.toBeDefined()
  }, 30000)
})
