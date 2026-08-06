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

import { LocalRegistry } from './helpers'
import {
  ANNOTATION_CHANGE_TYPE,
  BREAKING_CHANGE_TYPE,
  NON_BREAKING_CHANGE_TYPE,
  REST_API_TYPE,
  RISKY_CHANGE_TYPE,
} from '../src'
import type { BuildResult, OperationChanges, OperationType } from '../src'
import { calculateChangeSummary } from '../src/utils'

/**
 * Removing an element deprecated in more than one released version is risky rather than breaking. How long
 * it has been announced is a property of the consumer, so two operations reaching the same removed element
 * through one shared schema must be able to disagree about it. `traversalPartitionFunction` groups them by
 * what they were warned about, and apiDiff classifies each group's instance on its own.
 * The failure this suite prevents is a summary frozen per operation contradicting its own diffs:
 *
 *   operationTypes[].changesSummary              breaking 0   <- Summary "Number of changes"
 *   operationTypes[].numberOfImpactedOperations  breaking 1   <- Summary "Number of affected operations"
 *   data[<operation>].changeSummary              breaking 1
 *   data[<operation>].diffs                      no breaking diff at all
 *
 * Every fixture needs three publishes, since the downgrade wants more than one earlier version.
 * Removed operations, and elements no other operation can reach, are covered by `deprecated.test.ts`.
 */

const PACKAGE_ID = 'deprecated-removal-classification'

const LATE_COMER_ID = 'late-comer-post'
const LONG_LIVED_ID = 'long-lived-post'

const FIRST_ID = 'first-post'
const SECOND_ID = 'second-post'

const DRIFT_OPERATION_ID = 'thing-post'

const LEGACY_PROPERTY_PATH = 'components.schemas.Shared.properties.legacy'
const REQUEST_SCOPE = 'request'

const registry = LocalRegistry.openPackage(PACKAGE_ID)

/**
 * The smallest document that still tells two operations apart: `longLived` uses the shared schema from the
 * first version on, `lateComer` only from the second, so the notice qualifies for one and not the other.
 * `/late-comer` is declared first, which is the order the comparison walks. Both operations reach the
 * schema in the request and in the response, so the removal of one property reaches each of them twice.
 * Run with DEPRECATED_REMOVAL_DUMP=1 to print every summary and diff. Places worth a breakpoint:
 * `assignPartitions` and `diffClassificationOverride` in rest.deprecated.classification.ts,
 * `createChangeBase` in compare.utils.ts.
 */
describe('Removal of a long-deprecated element', () => {
  let result: BuildResult

  beforeAll(async () => {
    result = await publishSeries('minimal')
  })

  test('gives each operation its own difference instance', () => {
    const lateComerRemoval = requestRemoval(operationChanges(result, LATE_COMER_ID))
    const longLivedRemoval = requestRemoval(operationChanges(result, LONG_LIVED_ID))

    expect(lateComerRemoval).toBeDefined()
    expect(lateComerRemoval).not.toBe(longLivedRemoval)
  })

  test('downgrades the removal only for the operation warned long enough', () => {
    const longLived = operationChanges(result, LONG_LIVED_ID)
    expect(longLived.changeSummary[RISKY_CHANGE_TYPE]).toBe(1)
    expect(longLived.changeSummary[BREAKING_CHANGE_TYPE]).toBe(0)
    expect(requestRemoval(longLived)?.type).toBe(RISKY_CHANGE_TYPE)

    const lateComer = operationChanges(result, LATE_COMER_ID)
    expect(lateComer.changeSummary[BREAKING_CHANGE_TYPE]).toBe(1)
    expect(lateComer.changeSummary[RISKY_CHANGE_TYPE]).toBe(0)
    expect(requestRemoval(lateComer)?.type).toBe(BREAKING_CHANGE_TYPE)
  })

  // The symptom reported on the API changes tab: an operation counted as breaking while none of its diffs
  // was breaking. This is the invariant that catches it, for every operation at once.
  test('every operation summary matches the diffs it carries', () => {
    const data = result.comparisons[0]?.data ?? []
    expect(data.length).toBeGreaterThan(0)

    for (const changes of data) {
      expect(changes.changeSummary).toEqual(calculateChangeSummary(changes.diffs ?? []))
    }
  })

  test('full summary snapshot', () => {
    const { changesSummary, numberOfImpactedOperations } = restOperationType(result)

    // Only the removal in the request splits in two, because that is the only change the two operations
    // judge differently. Everything else they share is counted once: copies that agree carry the same
    // change id and collapse.
    expect(changesSummary).toEqual({
      [BREAKING_CHANGE_TYPE]: 1,
      [NON_BREAKING_CHANGE_TYPE]: 3,
      [RISKY_CHANGE_TYPE]: 1,
      [ANNOTATION_CHANGE_TYPE]: 0,
      unclassified: 0,
      deprecated: 0,
    })
    expect(numberOfImpactedOperations).toEqual({
      [BREAKING_CHANGE_TYPE]: 1,
      [NON_BREAKING_CHANGE_TYPE]: 2,
      [RISKY_CHANGE_TYPE]: 1,
      [ANNOTATION_CHANGE_TYPE]: 0,
      unclassified: 0,
      deprecated: 0,
    })
  })
})

/**
 * The common case: every operation reaching the element has been warned for just as long. Nothing to
 * disagree about, so the operations share a partition and the removal stays one difference. This is the
 * reuse that keeps partitioning from costing a traversal per operation.
 */
describe('Operations with the same deprecation history', () => {
  let result: BuildResult

  beforeAll(async () => {
    result = await publishSeries('agreeing')
  })

  test('share one difference instance', () => {
    const firstDiffs = operationChanges(result, FIRST_ID).diffs ?? []
    const secondDiffs = operationChanges(result, SECOND_ID).diffs ?? []

    expect(firstDiffs).toHaveLength(1)
    expect(secondDiffs).toHaveLength(1)
    expect(firstDiffs[0]).toBe(secondDiffs[0])
    expect(firstDiffs[0].type).toBe(RISKY_CHANGE_TYPE)
  })

  test('count the removal once and report both operations as impacted', () => {
    const { changesSummary, numberOfImpactedOperations } = restOperationType(result)

    expect(changesSummary?.[RISKY_CHANGE_TYPE]).toBe(1)
    expect(changesSummary?.[BREAKING_CHANGE_TYPE]).toBe(0)

    expect(numberOfImpactedOperations?.[RISKY_CHANGE_TYPE]).toBe(2)
    expect(numberOfImpactedOperations?.[BREAKING_CHANGE_TYPE]).toBe(0)
  })
})

/**
 * Two notions of "the same deprecated element" meet in this rule. Between versions the content drifts, so
 * the publication history is chained by the tolerant hash; within one version the removed value and the
 * stored record describe the same content, so the classification matches on the exact hash. Reword a
 * deprecation and the announcement must still count.
 */
describe('Deprecation history across a reworded notice', () => {
  test('a content change between releases does not restart the announcement', async () => {
    const result = await publishSeries('drift')

    const changes = operationChanges(result, DRIFT_OPERATION_ID)
    expect(changes.changeSummary[RISKY_CHANGE_TYPE]).toBe(1)
    expect(changes.changeSummary[BREAKING_CHANGE_TYPE]).toBe(0)
  })
})

/** Publishes `<fixture>-v1` to `-v3` in order, each against the one before, and returns the last build. */
async function publishSeries(fixture: string): Promise<BuildResult> {
  let result: BuildResult | undefined
  let previousVersion: string | undefined

  for (const step of [1, 2, 3]) {
    const version = `${fixture}-v${step}`
    result = await registry.publish(PACKAGE_ID, {
      packageId: PACKAGE_ID,
      version,
      ...previousVersion ? { previousVersion } : {},
      files: [{ fileId: `${version}.yaml`, publish: true }],
    })
    previousVersion = version
  }

  dumpComparison(result!)
  return result!
}

function restOperationType(result: BuildResult): OperationType {
  const operationType = result.comparisons[0]?.operationTypes.find(({ apiType }) => apiType === REST_API_TYPE)
  if (!operationType) {
    throw new Error('Comparison has no REST operation type')
  }
  return operationType
}

function operationChanges(result: BuildResult, operationId: string): OperationChanges {
  const changes = result.comparisons[0]?.data?.find(item => item.operationId === operationId)
  if (!changes) {
    throw new Error(`Comparison has no changes for operation ${operationId}`)
  }
  return changes
}

/** The removal of the deprecated property as the request of one operation sees it. */
function requestRemoval(changes: OperationChanges): NonNullable<OperationChanges['diffs']>[number] | undefined {
  return (changes.diffs ?? []).find(diff =>
    diff.scope === REQUEST_SCOPE &&
    'beforeDeclarationPaths' in diff &&
    (diff.beforeDeclarationPaths ?? []).some(jsonPath => jsonPath.join('.') === LEGACY_PROPERTY_PATH),
  )
}

/** Every summary and diff of the comparison, for a debugging run. Off unless DEPRECATED_REMOVAL_DUMP is set. */
function dumpComparison(result: BuildResult): void {
  if (!process.env.DEPRECATED_REMOVAL_DUMP) {
    return
  }

  const { changesSummary, numberOfImpactedOperations } = restOperationType(result)
  console.log('\n=== operationTypes[rest] ===')
  console.log('changesSummary              ', JSON.stringify(changesSummary))
  console.log('numberOfImpactedOperations  ', JSON.stringify(numberOfImpactedOperations))

  for (const changes of result.comparisons[0]?.data ?? []) {
    console.log(`\n=== ${changes.operationId ?? changes.previousOperationId} ===`)
    console.log('changeSummary  ', JSON.stringify(changes.changeSummary))
    console.log('impactedSummary', JSON.stringify(changes.impactedSummary))
    for (const diff of changes.diffs ?? []) {
      console.log(`  [${diff.type}] ${diff.action} scope=${diff.scope} :: ${diff.description}`)
    }
  }
}
