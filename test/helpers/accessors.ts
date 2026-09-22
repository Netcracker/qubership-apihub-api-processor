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

import {
  ApiOperation,
  BuildResult,
  ChangeSummary,
  EMPTY_CHANGE_SUMMARY,
  MESSAGE_SEVERITY,
  MessageCategory,
  NotificationMessage,
  OperationChanges,
  OperationsApiType,
  REST_API_TYPE,
  VersionDocument,
} from '../../src/processor'
import { operationKey } from '../../src/components/operations'

/**
 * The changes one operation carries in the first comparison of a build. Throws rather than returning
 * `undefined`, and names the operations that are there, because a lookup missing here usually means the
 * fixture produced different ids, not that the operation has no changes.
 */
export function operationChangesOf(result: BuildResult, operationId: string): OperationChanges {
  const data = result.comparisons[0]?.data ?? []
  const changes = data.find(item => item.operationId === operationId)
  if (!changes) {
    throw new Error(`Comparison has no changes for operation ${operationId}. Operations: ${listOf(data.map(item => item.operationId))}`)
  }
  return changes
}

/**
 * One operation of a build result. Throws rather than returning `undefined`, and names the keys that are
 * there: a miss is usually a fixture producing different ids, and `result.operations.get(id)?.field` turns
 * that into a complaint about the field instead of about the id.
 *
 * Takes the bare `operationId` and builds the map key, so call sites stop spelling
 * `operationKey({ apiType: REST_API_TYPE, operationId })` by hand.
 */
export function operationOf(
  result: BuildResult,
  operationId: string,
  apiType: OperationsApiType = REST_API_TYPE,
): ApiOperation {
  const key = operationKey({ apiType, operationId })
  const operation = result.operations.get(key)
  if (!operation) {
    throw new Error(`Build result has no operation ${key}. Operations: ${keysOf(result.operations)}`)
  }
  return operation
}

/**
 * One document of a build result, by `fileId`. Not by slug: every writer of that map — `setDocument`,
 * `buildDocuments` and the document-group strategy — keys it by `fileId`.
 */
export function documentOf(result: BuildResult, fileId: string): VersionDocument {
  const document = result.documents.get(fileId)
  if (!document) {
    throw new Error(`Build result has no document ${fileId}. Documents: ${keysOf(result.documents)}`)
  }
  return document
}

// Nothing at all is the most confusing miss of the three, so the message says so instead of trailing
// off after the colon, which is what `operationChangesOf` printed as a bare `undefined`.
function listOf(names: readonly (string | undefined)[]): string {
  return names.length ? names.join(', ') : '(none)'
}

function keysOf(map: ReadonlyMap<string, unknown>): string {
  return listOf(Array.from(map.keys()))
}

export function errorsOf(result: BuildResult): NotificationMessage[] {
  return result.notifications.filter(({ severity }) => severity === MESSAGE_SEVERITY.Error)
}

export function warningsOf(result: BuildResult): NotificationMessage[] {
  return result.notifications.filter(({ severity }) => severity === MESSAGE_SEVERITY.Warning)
}

export function notificationsOf(result: BuildResult, category: MessageCategory): NotificationMessage[] {
  return result.notifications.filter(notification => notification.category === category)
}

export const getVersionChanges = (result: BuildResult): Record<string, ChangeSummary> => {
  const summary: Record<string, ChangeSummary> = {}
  for (const comparison of result.comparisons) {
    for (const { apiType, changesSummary } of comparison.operationTypes) {
      // a copy per api type: accumulating onto the shared EMPTY_CHANGE_SUMMARY corrupts it for every other reader
      const totals = summary[apiType] ?? (summary[apiType] = { ...EMPTY_CHANGE_SUMMARY })

      for (const [key, value] of Object.entries(changesSummary ?? {})) {
        totals[key as keyof ChangeSummary] += value
      }
    }
  }
  return summary
}
