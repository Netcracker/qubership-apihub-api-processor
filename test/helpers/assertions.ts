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

import { BuildResult, ChangeSummary, EMPTY_CHANGE_SUMMARY, OperationsApiType, REST_API_TYPE } from '../../src'
import { calculateChangeSummary } from '../../src/utils'
import { operationTypeOf } from './accessors'

/**
 * A summary that contradicts the changes it counts is the symptom users report: an operation shown as
 * breaking while none of its changes is breaking. The two are computed at different moments, so any change
 * to how a verdict is decided can pull them apart. Assert this wherever a build reclassifies anything.
 */
export function expectSummariesMatchDiffs(result: BuildResult): void {
  let checked = 0
  for (const comparison of result.comparisons) {
    for (const changes of comparison.data ?? []) {
      expect(changes.changeSummary).toEqual(calculateChangeSummary(changes.diffs ?? []))
      checked += 1
    }
  }

  // Outside both loops: a build that produced no comparison, or none carrying operation changes, would
  // otherwise pass this having asserted nothing
  expect(checked).toBeGreaterThan(0)
}

/**
 * The change counts one comparison reports, and the operations those changes touched.
 *
 * Plain functions rather than `expect.extend` matchers: a custom matcher shortens the failure by one
 * more line and costs a type-declaration surface that has to be kept in sync by hand. The evidence is
 * in T9 of `tasks/plan.md`.
 */
export function expectChangesSummary(
  result: BuildResult,
  expected: Partial<ChangeSummary>,
  apiType: OperationsApiType = REST_API_TYPE,
): void {
  expect(operationTypeOf(result, apiType).changesSummary).toEqual({ ...EMPTY_CHANGE_SUMMARY, ...expected })
}

export function expectImpactedOperations(
  result: BuildResult,
  expected: Partial<ChangeSummary>,
  apiType: OperationsApiType = REST_API_TYPE,
): void {
  expect(operationTypeOf(result, apiType).numberOfImpactedOperations)
    .toEqual({ ...EMPTY_CHANGE_SUMMARY, ...expected })
}

export interface ChangeCounts {
  changes?: Partial<ChangeSummary>
  impacted?: Partial<ChangeSummary>
}

/**
 * Assert both counts in one `toEqual`, so a failure shows them side by side. `impacted` defaults to
 * `changes`, and calling this with no counts asserts that nothing changed.
 *
 * Pass `impacted` explicitly whenever it differs from `changes`: one change can touch several operations,
 * and `asyncapi-deduplication.test.ts` asserts `{ breaking: 1 }` against `{ breaking: 2 }` for that reason.
 * A test that asserts only one of the two counts keeps `expectChangesSummary` or `expectImpactedOperations`,
 * because this function would add an assertion on the other count.
 */
export function expectChangeCounts(
  result: BuildResult,
  { changes = {}, impacted = changes }: ChangeCounts = {},
  apiType: OperationsApiType = REST_API_TYPE,
): void {
  const { changesSummary, numberOfImpactedOperations } = operationTypeOf(result, apiType)
  expect({ changes: changesSummary, impacted: numberOfImpactedOperations }).toEqual({
    changes: { ...EMPTY_CHANGE_SUMMARY, ...changes },
    impacted: { ...EMPTY_CHANGE_SUMMARY, ...impacted },
  })
}
