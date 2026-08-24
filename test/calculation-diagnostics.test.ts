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
import { DiffAction } from '@netcracker/qubership-apihub-api-diff'
import { calculateHistoryForDeprecatedItems, calculateTolerantHash } from '../src/components/deprecated'
import { reclassifyBreakingChanges } from '../src/apitypes/rest/rest.changes'
import { BEFORE_VALUE_NORMALIZED_PROPERTY, HASH_FLAG, MESSAGE_CATEGORY, MESSAGE_SEVERITY, REST_API_TYPE } from '../src/consts'
import { BuilderContext, CompareOperationsPairContext, NotificationMessage } from '../src/types'

// Diagnostics of the calculation, not of the contract: they fire when the builder's own inputs arrive in a
// shape it cannot use. A real comparison does not produce them, so they are driven directly — and each one
// carries the document slug this change gave it, which is the half a regression would silently drop.
describe('Calculation diagnostics carry their category, severity and document', () => {
  const DOCUMENT = 'petstore'

  describe('deprecated items: the tolerant hash', () => {
    const cases: Array<[string, object, string]> = [
      ['no hash on the value', {}, MESSAGE_CATEGORY.TolerantHashMissing],
      // the lookup only runs for a value with ordinary keys, so the symbol alone would read as "missing"
      ['a hash that throws', { type: 'object', [HASH_FLAG]: () => { throw new Error('hash exploded') } }, MESSAGE_CATEGORY.TolerantHashFailed],
    ]

    test.each(cases)('should report %s', (_name, value, category) => {
      const notifications: NotificationMessage[] = []

      expect(calculateTolerantHash(value as never, notifications, DOCUMENT)).toBeUndefined()
      expect(notifications).toEqual([{
        category,
        severity: MESSAGE_SEVERITY.Warning,
        message: expect.any(String),
        documentId: DOCUMENT,
      }])
    })
  })

  // Carrying the previous version's history onto an operation walks the declaration paths of its deprecated
  // items. A path shaped like a component reference whose type or name is not a string cannot be matched, and
  // that operation loses its history — the others keep theirs, so it is reported rather than thrown.
  test('should report a deprecated item whose component path cannot be read', async () => {
    const notifications: NotificationMessage[] = []
    const deprecatedItem = (declarationJsonPaths: unknown[][]): unknown =>
      ({ tolerantHash: 'same-hash', declarationJsonPaths, deprecatedInPreviousVersions: [] })

    const current = {
      operationId: 'pets-get',
      documentId: DOCUMENT,
      deprecated: true,
      // the component type is a number, which `matchSharedComponent` refuses
      deprecatedItems: [deprecatedItem([['components', 1, 'Pet', 'deprecated']])],
    }
    const ctx = {
      notifications,
      versionDeprecatedResolver: async () => ({
        operations: [{
          operationId: 'pets-get',
          deprecatedItems: [deprecatedItem([['components', 'schemas', 'Pet', 'deprecated']])],
        }],
      }),
    } as unknown as BuilderContext

    await calculateHistoryForDeprecatedItems(REST_API_TYPE, [current] as never, 'v1', 'pkg', ctx)

    expect(notifications).toEqual([{
      category: MESSAGE_CATEGORY.DeprecatedComponentPath,
      severity: MESSAGE_SEVERITY.Error,
      message: expect.any(String),
      documentId: DOCUMENT,
    }])
  })

  describe('changelog: the risky reclassification', () => {
    // the reclassification only looks at breaking removals of an operation whose previous version carried
    // deprecated items, so the context stands in for the resolver that would supply them
    const contextWith = (notifications: NotificationMessage[]): CompareOperationsPairContext => ({
      notifications,
      previousVersion: 'v1',
      previousPackageId: 'pkg',
      versionDeprecatedResolver: async () => ({
        operations: [{ operationId: 'pets-get', deprecatedItems: [{}], deprecatedInPreviousVersions: ['v1'] }],
      }),
    } as unknown as CompareOperationsPairContext)

    // `beforeDeclarationPaths` is read before the diagnostics, by the operation-removal check
    const breakingRemoval = (extra: Record<symbol, unknown> = {}): unknown =>
      ({ action: DiffAction.remove, type: 'breaking', beforeDeclarationPaths: [['paths', '/pets', 'get']], ...extra })

    test('should report a diff whose normalized before-value is missing', async () => {
      const notifications: NotificationMessage[] = []

      await reclassifyBreakingChanges('pets-get', {}, [breakingRemoval() as never], contextWith(notifications), DOCUMENT)

      expect(notifications).toEqual([{
        category: MESSAGE_CATEGORY.RiskyBeforeValue,
        severity: MESSAGE_SEVERITY.Warning,
        message: expect.any(String),
        documentId: DOCUMENT,
      }])
    })

    test('should report a deprecated before-value that carries no origins', async () => {
      const notifications: NotificationMessage[] = []
      const withoutOrigins = breakingRemoval({ [BEFORE_VALUE_NORMALIZED_PROPERTY]: { deprecated: true } })

      await reclassifyBreakingChanges('pets-get', {}, [withoutOrigins as never], contextWith(notifications), DOCUMENT)

      expect(notifications).toEqual([{
        category: MESSAGE_CATEGORY.RiskyOrigins,
        severity: MESSAGE_SEVERITY.Warning,
        message: expect.any(String),
        documentId: DOCUMENT,
      }])
    })
  })
})
