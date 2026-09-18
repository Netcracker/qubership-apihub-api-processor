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
  BuildResult,
  ChangeSummary,
  EMPTY_CHANGE_SUMMARY,
  OperationChanges,
} from '../../src/processor'

/**
 * The changes one operation carries in the first comparison of a build. Throws rather than returning
 * `undefined`, and names the operations that are there, because a lookup missing here usually means the
 * fixture produced different ids, not that the operation has no changes.
 */
export function operationChangesOf(result: BuildResult, operationId: string): OperationChanges {
  const changes = result.comparisons[0]?.data?.find(item => item.operationId === operationId)
  if (!changes) {
    const available = result.comparisons[0]?.data?.map(item => item.operationId).join(', ')
    throw new Error(`Comparison has no changes for operation ${operationId}. Operations: ${available}`)
  }
  return changes
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
