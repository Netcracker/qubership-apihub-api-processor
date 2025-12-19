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

import { isEmpty, isObject, SLUG_OPTIONS_OPERATION_ID, slugify } from '../../utils'
import {
  aggregateDiffsWithRollup,
  apiDiff,
  Diff,
  DIFF_META_KEY,
  DIFFS_AGGREGATED_META_KEY,
} from '@netcracker/qubership-apihub-api-diff'
import {
  AFTER_VALUE_NORMALIZED_PROPERTY,
  BEFORE_VALUE_NORMALIZED_PROPERTY,
  NORMALIZE_OPTIONS,
  ORIGINS_SYMBOL,
} from '../../consts'
import {
  CompareOperationsPairContext,
  ComparisonDocument,
  DocumentsCompare,
  DocumentsCompareData,
  OperationChanges,
  ResolvedVersionDocument,
  WithAggregatedDiffs,
  WithDiffMetaRecord,
} from '../../types'
import {
  createComparisonDocument,
  createComparisonInternalDocumentId,
  createOperationChange,
  getOperationTags,
  OperationsMap,
} from '../../components'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/cjs/spec-types'

export const compareDocuments: DocumentsCompare = async (
  operationsMap: OperationsMap,
  prevDoc: ResolvedVersionDocument | undefined,
  currDoc: ResolvedVersionDocument | undefined,
  ctx: CompareOperationsPairContext,
): Promise<DocumentsCompareData> => {
  const {
    apiType,
    rawDocumentResolver,
    previousVersion,
    currentVersion,
    previousPackageId,
    currentPackageId,
    currentGroup,
    previousGroup,
  } = ctx

  const comparisonInternalDocumentId = createComparisonInternalDocumentId(prevDoc, currDoc, previousVersion, currentVersion)
  const prevFile = prevDoc && await rawDocumentResolver(previousVersion, previousPackageId, prevDoc.slug)
  const currFile = currDoc && await rawDocumentResolver(currentVersion, currentPackageId, currDoc.slug)
  let prevDocData = prevFile && JSON.parse(await prevFile.text()) as AsyncAPIV3.AsyncAPIObject
  let currDocData = currFile && JSON.parse(await currFile.text()) as AsyncAPIV3.AsyncAPIObject

  // Create an empty counterpart of the document for the case when one of the documents is empty
  if (!prevDocData && currDocData) {
    prevDocData = createCopyWithEmptyOperations(currDocData)
  }
  if (prevDocData && !currDocData) {
    currDocData = createCopyWithEmptyOperations(prevDocData)
  }

  const { merged, diffs } = apiDiff(
    prevDocData,
    currDocData,
    {
      ...NORMALIZE_OPTIONS,
      metaKey: DIFF_META_KEY,
      originsFlag: ORIGINS_SYMBOL,
      normalizedResult: true,
      afterValueNormalizedProperty: AFTER_VALUE_NORMALIZED_PROPERTY,
      beforeValueNormalizedProperty: BEFORE_VALUE_NORMALIZED_PROPERTY,
    },
  ) as { merged: AsyncAPIV3.AsyncAPIObject; diffs: Diff[] }

  if (isEmpty(diffs)) {
    return { operationChanges: [], tags: new Set() }
  }

  aggregateDiffsWithRollup(merged, DIFF_META_KEY, DIFFS_AGGREGATED_META_KEY)

  const tags = new Set<string>()
  const operationChanges: OperationChanges[] = []

  // Iterate through operations in merged document
  const { operations } = merged
  if (isObject(operations)) {
    for (const [operationKey, operationData] of Object.entries(operations)) {
      if (!isObject(operationData)) {
        continue
      }
      const operationObject = operationData as AsyncAPIV3.OperationObject
      // Extract action and channel from operation
      const { action, channel: operationChannel } = operationObject
      if (!action || !operationChannel) {
        continue
      }

      //  todo check - ref must be resolved already in merged document
      // Extract channel name from reference
      const channelRef = (operationChannel as AsyncAPIV3.ReferenceObject)?.$ref
      const channel = typeof channelRef === 'string' && channelRef.startsWith('#/channels/')
        ? channelRef.split('/').pop() || operationKey
        : operationKey

      // Use simple operation ID (no normalization needed for AsyncAPI)
      const operationId = slugify(`${action}-${channel}`, SLUG_OPTIONS_OPERATION_ID)

      const { current, previous } = operationsMap[operationId] ?? {}
      if (!current && !previous) {
        throw new Error(`Can't find the ${operationId} operation from documents pair ${prevDoc?.fileId} and ${currDoc?.fileId}`)
      }

      const operationPotentiallyChanged = Boolean(current && previous)
      const operationAddedOrRemoved = !operationPotentiallyChanged

      let operationDiffs: Diff[] = []
      if (operationPotentiallyChanged) {
        operationDiffs = [
          ...(operationObject as WithAggregatedDiffs<AsyncAPIV3.OperationObject>)[DIFFS_AGGREGATED_META_KEY] ?? [],
        ]
      }
      if (operationAddedOrRemoved) {
        const operationAddedOrRemovedDiff = (operations as WithDiffMetaRecord<AsyncAPIV3.OperationsObject>)[DIFF_META_KEY]?.[operationKey]
        if (operationAddedOrRemovedDiff) {
          operationDiffs.push(operationAddedOrRemovedDiff)
        }
      }

      if (isEmpty(operationDiffs)) {
        continue
      }

      // Note: Skip breaking change reclassification for AsyncAPI (as per plan)

      operationChanges.push(createOperationChange(apiType, operationDiffs, comparisonInternalDocumentId, previous, current, currentGroup, previousGroup))
      getOperationTags(current ?? previous).forEach(tag => tags.add(tag))
    }
  }

  let comparisonDocument: ComparisonDocument | undefined
  if (operationChanges.length) {
    comparisonDocument = createComparisonDocument(comparisonInternalDocumentId, merged)
  }

  return {
    operationChanges,
    tags,
    ...(comparisonDocument) ? { comparisonDocument } : {},
  }
}

/**
 * Creates a copy of the AsyncAPI document with empty operations
 * Used for comparison when one document doesn't exist
 */
function createCopyWithEmptyOperations(template: AsyncAPIV3.AsyncAPIObject): AsyncAPIV3.AsyncAPIObject {
  const { operations, ...rest } = template

  return {
    operations: operations ? Object.fromEntries(
      Object.keys(operations).map(key => [key, {} as AsyncAPIV3.OperationObject]),
    ) : {},
    ...rest,
  }
}

