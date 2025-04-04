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
  ApiAudienceTransition,
  CompareContext,
  CompareOperationsPairContext,
  OperationChanges,
  OperationId,
  OperationsApiType,
  OperationType,
  ResolvedOperation,
  VersionCache,
  VersionParams,
  VersionsComparison,
} from '../../types'
import { MESSAGE_SEVERITY } from '../../consts'
import {
  calculateTotalImpactedSummary,
  getOperationMetadata,
  getOperationsHashMapByApiType,
  getOperationTags,
  getOperationTypesFromTwoVersions,
  getUniqueApiTypesFromVersions,
  takeSubstringIf,
  totalChanges,
} from './compare.utils'
import {
  calculateApiAudienceTransitions,
  calculateChangeSummary,
  calculateDiffId,
  calculateImpactedSummary,
  executeInBatches,
  getSplittedVersionKey,
  removeFirstSlash,
  removeObjectDuplicates,
  slugify,
} from '../../utils'
import { asyncDebugPerformance, DebugPerformanceContext } from '../../utils/logs'
import { validateBwcBreakingChanges } from './bwc.validation'
import { REST_API_TYPE } from '../../apitypes'

export async function compareVersionsOperations(
  prev: VersionParams,
  curr: VersionParams,
  ctx: CompareContext,
  debugCtx?: DebugPerformanceContext,
): Promise<VersionsComparison> {
  const changes: OperationChanges[] = []
  const operationTypes: OperationType[] = []

  const { versionResolver } = ctx

  // resolve all version with operation hashes
  const prevVersionData = prev && (await versionResolver(...prev) ?? { version: prev?.[0], packageId: prev?.[1] })
  const currVersionData = curr && (await versionResolver(...curr) ?? { version: curr?.[0], packageId: curr?.[1] })

  // compare operations of each type
  for (const apiType of getUniqueApiTypesFromVersions(prevVersionData, currVersionData)) {
    const [operationType, operationsChanges = []] = await asyncDebugPerformance(
      '[ApiType]',
      (innerDebugCtx) => compareCurrentApiType(apiType, prevVersionData, currVersionData, ctx, innerDebugCtx) ?? [],
      debugCtx,
      [apiType],
    ) ?? []

    if (!operationType) {
      continue
    }

    operationTypes.push(operationType)
    changes.push(...operationsChanges)
  }

  const comparisonFileId = [...prev || [], ...curr || []].filter(Boolean).join('_')

  const [currentVersion, currentRevision] = getSplittedVersionKey(currVersionData?.version)
  const [previousVersion, previousRevision] = getSplittedVersionKey(prevVersionData?.version)

  return {
    packageId: currVersionData?.packageId ?? '',
    version: currentVersion,
    revision: currentRevision,
    previousVersion: previousVersion,
    previousVersionRevision: previousRevision,
    previousVersionPackageId: prevVersionData?.packageId ?? '',
    operationTypes,
    fromCache: false,
    ...changes.length ? {
      comparisonFileId,
      data: changes,
    } : {},
  }
}

const HANDLE_TYPE_FULLY_ADDED = 'added'
const HANDLE_TYPE_FULLY_REMOVED = 'removed'
const HANDLE_TYPE_FULLY_CHANGED = 'changed'

type HandleType = typeof HANDLE_TYPE_FULLY_ADDED | typeof HANDLE_TYPE_FULLY_REMOVED | typeof HANDLE_TYPE_FULLY_CHANGED

export interface MappingResult<T extends PropertyKey> {
  [HANDLE_TYPE_FULLY_ADDED]: T[]
  [HANDLE_TYPE_FULLY_REMOVED]: T[]
  [HANDLE_TYPE_FULLY_CHANGED]: Record<T, T>
}

async function compareCurrentApiType(
  apiType: OperationsApiType,
  prev: VersionCache | null,
  curr: VersionCache | null,
  ctx: CompareContext,
  debugCtx?: DebugPerformanceContext,
): Promise<[OperationType, OperationChanges[]] | null> {
  const { batchSize, versionOperationsResolver } = ctx

  const tags = new Set<string>()

  const changedOperations = new Map<string, OperationChanges>()
  const apiBuilder = ctx.apiBuilders.find((builder) => apiType === builder.apiType)
  if (!apiBuilder) { return null }

  const [prevOperationTypesData, currOperationTypesData] = getOperationTypesFromTwoVersions(prev, curr)

  const prevOperationsCount = prevOperationTypesData.find(data => apiType === data.apiType)?.operationsCount
  const currOperationsCount = currOperationTypesData.find(data => apiType === data.apiType)?.operationsCount

  const { operations: prevOperations = [] } = await versionOperationsResolver(apiType, prev?.version ?? '', prev?.packageId ?? '', undefined, false, prevOperationsCount) || {}
  const { operations: currOperations = [] } = await versionOperationsResolver(apiType, curr?.version ?? '', curr?.packageId ?? '', undefined, false, currOperationsCount) || {}

  const [prevReducedOperationIdToHashMap, prevReducedOperationIdToOriginal] = getOperationsHashMapByApiType(apiType, prevOperations, ctx)
  const [currReducedOperationIdToHashMap, currReducedOperationIdToOriginal] = getOperationsHashMapByApiType(apiType, currOperations, ctx, true)

  const reducedOperationIds = new Set([...Object.keys(prevReducedOperationIdToHashMap), ...Object.keys(currReducedOperationIdToHashMap)])
  const operationsMapping: MappingResult<OperationId> = { [HANDLE_TYPE_FULLY_ADDED]: [], [HANDLE_TYPE_FULLY_REMOVED]: [], [HANDLE_TYPE_FULLY_CHANGED]: {} }
  const apiAudienceTransitions: ApiAudienceTransition[] = []
  const pairedOperationIds: Record<OperationId, OperationId> = {}

  for (const reducedOperationId of reducedOperationIds) {
    const prevOperationHash = prevReducedOperationIdToHashMap[reducedOperationId]
    const currOperationHash = currReducedOperationIdToHashMap[reducedOperationId]
    const prevOperationId = prevReducedOperationIdToOriginal[reducedOperationId]
    const currOperationId = currReducedOperationIdToOriginal[reducedOperationId]
    if (prevOperationHash && currOperationHash) {
      pairedOperationIds[prevOperationId] = currOperationId
      // operation not changed
      if (prevOperationHash === currOperationHash) { continue }
      // operation changed
      operationsMapping[HANDLE_TYPE_FULLY_CHANGED][prevOperationId] = currOperationId
    } else if (prevOperationHash) {
      // operation removed
      operationsMapping[HANDLE_TYPE_FULLY_REMOVED].push(prevOperationId)
    } else if (currOperationHash) {
      // operation added
      operationsMapping[HANDLE_TYPE_FULLY_ADDED].push(currOperationId)
    }
  }

  const { version: prevVersion, packageId: prevPackageId } = prev ?? { version: '', packageId: '' }
  const { version: currVersion, packageId: currPackageId } = curr ?? { version: '', packageId: '' }

  const { currentGroup, previousGroup } = ctx.config
  const currGroupSlug = slugify(removeFirstSlash(currentGroup || ''))
  const prevGroupSlug = slugify(removeFirstSlash(previousGroup || ''))

  const pairContext: CompareOperationsPairContext = {
    notifications: ctx.notifications,
    versionDeprecatedResolver: ctx.versionDeprecatedResolver,
    previousVersion: prevVersion,
    currentVersion: currVersion,
    previousPackageId: prevPackageId,
    currentPackageId: currPackageId,
  }

  const handleAddedOrRemovedOperations = async (
    version: string,
    packageId: string,
    operationIds: OperationId[],
    handleType: HandleType,
    innerDebugCtx?: DebugPerformanceContext,
  ): Promise<void> => {
    const { operations = [] } = await versionOperationsResolver(
      apiType,
      version,
      packageId,
      operationIds,
      true,
    ) || {}

    if (!operations?.length) {
      const errorMessage = `Cannot get operations for package ${packageId} and version ${version} (with ids=${operationIds.join(',')})`
      ctx.notifications.push({
        severity: MESSAGE_SEVERITY.Error,
        message: errorMessage,
      })
      throw new Error(errorMessage)
    }
    if (operations.length !== operationIds.length) {
      const notResolvedOperationIds = operationIds.filter(id => !operations.find(({ operationId }) => id === operationId))
      const errorMessage = `Some operations (${notResolvedOperationIds}) for package ${packageId} and version ${version} (with ids=${operationIds.join(',')})`
      ctx.notifications.push({
        severity: MESSAGE_SEVERITY.Error,
        message: errorMessage,
      })
      throw new Error(errorMessage)
    }

    for (const operation of operations) {
      const isOperationAdded = handleType === HANDLE_TYPE_FULLY_ADDED
      const [prevOperation, currOperation] = isOperationAdded ? [undefined, operation] : [operation, undefined]
      const operationDiffs = await asyncDebugPerformance(
        '[Operation]',
        async () => apiBuilder.compareOperationsData!(currOperation, prevOperation, pairContext),
        innerDebugCtx,
        [operation.operationId],
      )
      const changeSummary = calculateChangeSummary(operationDiffs)
      const impactedSummary = calculateImpactedSummary([changeSummary])

      const changedOperation = {
        apiType,
        operationId: operation.operationId,
        [isOperationAdded ? 'dataHash' : 'previousDataHash']: operation.dataHash,
        [isOperationAdded ? 'apiKind' : 'previousApiKind']: operation.apiKind,
        diffs: operationDiffs,
        changeSummary: changeSummary,
        impactedSummary: impactedSummary,
        metadata: getOperationMetadata(operation),
      }
      validateBwcBreakingChanges(changedOperation)
      changedOperations.set(operation.operationId, changedOperation)
      getOperationTags(operation).forEach(tag => tags.add(tag))
    }
  }

  // todo: convert from objects analysis to apihub-diff result analysis after the "info" section participates in the comparison of operations
  await asyncDebugPerformance('[ApiAudience]', async () => await executeInBatches(Object.entries(pairedOperationIds), async (operationsBatch) => {
    const previousBatch = operationsBatch.map(([prevOperationId]) => prevOperationId)
    const currentBatch = operationsBatch.map(([, currOperationId]) => currOperationId)
    const { operations: currOperationsWithoutData = [] } = await versionOperationsResolver(apiType, currVersion, currPackageId, previousBatch, false) || {}
    const { operations: prevOperationsWithoutData = [] } = await versionOperationsResolver(apiType, prevVersion, prevPackageId, currentBatch, false) || {}

    const pairOperationsMap = createPairOperationsMap(currGroupSlug, prevGroupSlug, currOperationsWithoutData, prevOperationsWithoutData)
    Object.values(pairOperationsMap).forEach((pair) => {
      calculateApiAudienceTransitions(pair.current, pair.previous, apiAudienceTransitions)
    })
  }, batchSize), debugCtx)

  await asyncDebugPerformance('[Added]', async (innerDebugCtx) => await executeInBatches(operationsMapping.removed, async (operationsBatch) => {
    await handleAddedOrRemovedOperations(
      prevVersion!,
      prevPackageId!,
      operationsBatch,
      HANDLE_TYPE_FULLY_REMOVED,
      innerDebugCtx,
    )
  }, batchSize), debugCtx)

  await asyncDebugPerformance('[Removed]', async (innerDebugCtx) => await executeInBatches(operationsMapping.added, async (operationsBatch) => {
    await handleAddedOrRemovedOperations(
      currVersion!,
      currPackageId!,
      operationsBatch,
      HANDLE_TYPE_FULLY_ADDED,
      innerDebugCtx,
    )
  }, batchSize), debugCtx)

  if (!apiBuilder.compareOperationsData) { return null }

  await asyncDebugPerformance('[Changed]', async (innerDebugCtx) =>
    await executeInBatches(Object.entries(operationsMapping.changed), async (operationsBatch) => {
      const previousBatch = operationsBatch.map(([prevOperationId]) => prevOperationId)
      const currentBatch = operationsBatch.map(([, currOperationId]) => currOperationId)
      const { operations: prevOperationsWithData = [] } = await versionOperationsResolver(apiType, prevVersion, prevPackageId, previousBatch) || {}
      const { operations: currOperationsWithData = [] } = await versionOperationsResolver(apiType, currVersion, currPackageId, currentBatch) || {}

      const operationsMap = createPairOperationsMap(currGroupSlug, prevGroupSlug, currOperationsWithData, prevOperationsWithData)

      // compare Operations Data
      for (const operationId of Object.keys(operationsMap)) {
        const operationsEntry = operationsMap[operationId]
        if (!operationsEntry.previous?.data) {
          ctx.notifications.push({
            severity: MESSAGE_SEVERITY.Error,
            message: `Cannot compare operations (${operationId}) of packages ${prevPackageId}/${prevVersion} and ${currPackageId}/${currVersion} - Previous operation data not found`,
          })
          continue
        }
        if (!operationsEntry.current?.data) {
          ctx.notifications.push({
            severity: MESSAGE_SEVERITY.Error,
            message: `Cannot compare operations (${operationId}) of packages ${prevPackageId}/${prevVersion} and ${currPackageId}/${currVersion} - Current operation data not found`,
          })
          continue
        }
        const operationDiffs = await asyncDebugPerformance(
          '[Operation]',
          async () => apiBuilder.compareOperationsData!(operationsEntry.current, operationsEntry.previous, pairContext),
          innerDebugCtx,
          [operationId],
        )
        const changeSummary = calculateChangeSummary(operationDiffs)
        const impactedSummary = calculateImpactedSummary([changeSummary])

        // skip if no changes
        if (totalChanges(changeSummary) && operationsEntry.previous) {
          const changedOperation = {
            apiType,
            operationId: takeSubstringIf(!!currGroupSlug, operationsEntry.current.operationId, removeFirstSlash(currentGroup ?? '').length),
            dataHash: operationsEntry.current.dataHash,
            previousDataHash: operationsEntry.previous.dataHash,
            apiKind: operationsEntry.current.apiKind,
            previousApiKind: operationsEntry.previous.apiKind,
            diffs: operationDiffs,
            changeSummary: changeSummary,
            impactedSummary: impactedSummary,
            metadata: {
              ...getOperationMetadata(operationsEntry.current),
              previousOperationMetadata: getOperationMetadata(operationsEntry.previous),
            },
          }
          validateBwcBreakingChanges(changedOperation)
          changedOperations.set(operationId, changedOperation)
          getOperationTags(operationsEntry.current).forEach(tag => tags.add(tag))
        }
      }
    }, batchSize),
    debugCtx,
  )

  const operationChanges = Array.from(changedOperations.values())

  const dedupedChanges = removeObjectDuplicates(operationChanges.flatMap(({ diffs }) => diffs), calculateDiffId)
  const changesSummary = calculateChangeSummary(dedupedChanges)
  const numberOfImpactedOperations = calculateTotalImpactedSummary(
    operationChanges.map(({ impactedSummary }) => impactedSummary),
  )

  return [
    {
      apiType,
      changesSummary,
      numberOfImpactedOperations,
      tags: [...tags.values()].sort(),
      apiAudienceTransitions,
    },
    operationChanges,
  ]
}

const createPairOperationsMap = (currGroupSlug: string, prevGroupSlug: string, currentOperations: ResolvedOperation[], previousOperations: ResolvedOperation[]): Record<string, { previous?: ResolvedOperation; current: ResolvedOperation }> => {

  const operationsMap: Record<string, { previous?: ResolvedOperation; current: ResolvedOperation }> = {}

  for (const currentOperation of currentOperations) {
    // todo
    const normalizedOperationId = currentOperation.apiType === REST_API_TYPE ? slugify(`${currentOperation.metadata.path}-${currentOperation.metadata.method}`, [], IGNORE_PATH_PARAM_UNIFIED_PLACEHOLDER) : currentOperation.operationId
    operationsMap[takeSubstringIf(!!currGroupSlug, normalizedOperationId, currGroupSlug.length)] = { current: currentOperation }
  }

  for (const previousOperation of previousOperations) {
    // todo
    const normalizedOperationId = previousOperation.apiType === REST_API_TYPE ? slugify(`${previousOperation.metadata.path}-${previousOperation.metadata.method}`, [], IGNORE_PATH_PARAM_UNIFIED_PLACEHOLDER) : previousOperation.operationId
    const prevOperationId = takeSubstringIf(!!prevGroupSlug, normalizedOperationId, prevGroupSlug.length)
    const operationsMappingElement = operationsMap[prevOperationId]
    if (operationsMappingElement) {
      operationsMap[prevOperationId] = {
        ...operationsMappingElement,
        previous: previousOperation,
      }
    }
  }

  return operationsMap
}
