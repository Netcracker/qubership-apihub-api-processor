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

import { calculateAsyncOperationId, isEmpty, isObject } from '../../utils'
import {
  aggregateDiffsWithRollup,
  apiDiff,
  Diff,
  DiffAction,
  DIFF_META_KEY,
  DIFFS_AGGREGATED_META_KEY,
} from '@netcracker/qubership-apihub-api-diff'
import {
  AFTER_VALUE_NORMALIZED_PROPERTY,
  BEFORE_KEY_PROPERTY,
  BEFORE_VALUE_NORMALIZED_PROPERTY,
  FIRST_REFERENCE_KEY_PROPERTY,
  MESSAGE_SEVERITY,
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
  WithDiffMetaRecord,
} from '../../types'
import {
  createComparisonDocument,
  createComparisonInternalDocumentId,
  createOperationChange,
  getOperationTags,
  OperationsMap,
} from '../../components'
import { createAsyncApiCompatibilityScopeFunction } from '../../components/compare/async.bwc.validation'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/esm/spec-types'
import {
  extractAggregatedDiffs,
  extractInfoDiffs,
  extractOwnDiffs,
  extractOwnPropertyDiff,
  getAsyncMessageId,
} from './async.utils'

/**
 * The key this node had in the previous version, or `undefined` when it had none.
 *
 * api-diff records a before-key only where it mapped a node onto a *different* key, so an absent
 * symbol means one of two opposite things: the node was mapped onto the key it already has, or it
 * was added. The parent map's diff metadata is what tells them apart - it is the authoritative
 * record of additions, and the symbol only ever encoded that a second time.
 */
const previousKeyOf = (parent: unknown, key: string): string | undefined => {
  if (!isObject(parent)) {
    return undefined
  }
  const container = parent as Record<PropertyKey, unknown>
  const diff = (container[DIFF_META_KEY] as Record<string, Diff> | undefined)?.[key]
  if (diff?.action === DiffAction.add) {
    return undefined
  }
  const beforeKey = (container[key] as Record<PropertyKey, unknown> | undefined)?.[BEFORE_KEY_PROPERTY]
  // Renamed by api-diff, or mapped onto the key it already has.
  return typeof beforeKey === 'string' ? beforeKey : key
}

/**
 * The APIHUB operation id this merged operation/message had in the previous version, read off
 * api-diff's own mapping decision rather than re-derived.
 *
 * The message id comes from the **channel's** messages map, not from `operation.messages[]`: the
 * latter is an array, whose elements carry a numeric before-key by construction, so it cannot name
 * the previous message.
 *
 * Either half being absent means the pair has no previous operation - an addition - and no id is
 * invented for it.
 */
const previousOperationIdOf = (
  operations: unknown,
  asyncOperationId: string,
  operationObject: AsyncAPIV3.OperationObject,
  messageId: string,
): string | undefined => {
  const previousAsyncOperationId = previousKeyOf(operations, asyncOperationId)
  const channel = operationObject.channel as AsyncAPIV3.ChannelObject | undefined
  const previousMessageId = previousKeyOf(channel?.messages, messageId)

  return previousAsyncOperationId !== undefined && previousMessageId !== undefined
    ? calculateAsyncOperationId(previousAsyncOperationId, previousMessageId)
    : undefined
}

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

  const comparisonInternalDocumentId = createComparisonInternalDocumentId(previousVersion, previousPackageId, prevDoc?.slug, currentVersion, currentPackageId, currDoc?.slug)
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
      normalizedResult: false,
      afterValueNormalizedProperty: AFTER_VALUE_NORMALIZED_PROPERTY,
      beforeValueNormalizedProperty: BEFORE_VALUE_NORMALIZED_PROPERTY,
      firstReferenceKeyProperty: FIRST_REFERENCE_KEY_PROPERTY,
      // api-diff records a before-key wherever it mapped a node onto a different key, so an entity
      // whose generated id changed can be located by either side's id instead of by guessing.
      beforeKeyProperty: BEFORE_KEY_PROPERTY,
      apiCompatibilityScopeFunction: createAsyncApiCompatibilityScopeFunction(),
    },
  ) as { merged: AsyncAPIV3.AsyncAPIObject; diffs: Diff[] }

  if (isEmpty(diffs)) {
    return { operationChanges: [], tags: new Set() }
  }

  aggregateDiffsWithRollup(merged, DIFF_META_KEY, DIFFS_AGGREGATED_META_KEY)

  const tags = new Set<string>()
  const operationChanges: OperationChanges[] = []

  // Precompute root-level diffs once (shared across all operations)
  const asyncApiVersionDiffs = extractOwnPropertyDiff(merged, 'asyncapi')
  const infoDiffs = extractInfoDiffs(merged)
  const idDiffs = extractOwnPropertyDiff(merged, 'id')
  // Note: defaultContentType changes are handled by normalization inside apiDiff.
  // Messages without explicit contentType inherit from defaultContentType during normalization,
  // so changes to defaultContentType automatically appear in the message's aggregated diffs.

  // Iterate through operations in merged document
  const { operations: asyncOperations } = merged
  if (asyncOperations && isObject(asyncOperations)) {
    for (const [asyncOperationId, operationData] of Object.entries(asyncOperations)) {
      if (!operationData || !isObject(operationData)) {
        continue
      }
      const operationObject = operationData as AsyncAPIV3.OperationObject
      const messages = operationData.messages as AsyncAPIV3.MessageObject[]

      if (!Array.isArray(messages) || messages.length === 0) {
        continue
      }

      const { action, channel: operationChannel } = operationObject
      if (!action || !operationChannel) {
        continue
      }

      for (const [messageIndex, message] of messages.entries()) {
        const messageId = getAsyncMessageId(message)
        const operationId = calculateAsyncOperationId(asyncOperationId, messageId)
        // A mapped node is keyed by the after side, so `operationId` is the current id and finds
        // the pair the pre-pairing emitted. The before-side id is the fallback: where the
        // pre-pairing and api-diff disagree about which entities correspond, api-diff decided the
        // merged document, so its verdict is the one that must resolve.
        const previousOperationId = previousOperationIdOf(
          asyncOperations, asyncOperationId, operationObject, messageId,
        )
        const {
          current,
          previous,
        } = operationsMap[operationId]
          ?? (previousOperationId !== undefined ? operationsMap[previousOperationId] : undefined)
          ?? {}
        if (!current && !previous) {
          throw new Error(`Can't find the ${operationId} operation from documents pair ${prevDoc?.fileId} and ${currDoc?.fileId}`)
        }
        if (previousOperationId !== undefined && previous && previous.operationId !== previousOperationId) {
          // api-diff and the operation pre-pairing disagree about which entities correspond. The
          // build still completes - api-diff's decision above already resolved the pair - so this
          // is a warning, not an error.
          ctx.notifications.push({
            severity: MESSAGE_SEVERITY.Warning,
            message: `AsyncAPI operation pairing disagreement: api-diff mapped '${previousOperationId}' onto ` +
              `'${operationId}', while operation pairing chose '${previous.operationId}'. ` +
              'api-diff\'s decision was used.',
            fileId: currDoc?.fileId,
          })
        }

        const operationPotentiallyChanged = Boolean(current && previous)
        const operationAddedOrRemoved = !operationPotentiallyChanged

        let operationDiffs: Diff[] = []
        if (operationPotentiallyChanged) {
          const channel = operationObject.channel as AsyncAPIV3.ChannelObject
          // Aggregated — subtree is exclusive to this apihub operation.
          // Own — subtree has siblings belonging to other apihub operations,
          // so rollup would leak their diffs.
          operationDiffs = [
            ...extractAggregatedDiffs(message),              // leaf of this apihub operation
            ...extractOwnDiffs(operationObject),             // siblings: messages[]
            ...extractOwnDiffs(channel),                     // siblings: channel.messages (shared channels)
            ...extractAggregatedDiffs(channel.servers),
            ...extractAggregatedDiffs(operationObject.tags),
            // exclusive-to-operation subtrees:
            ...extractAggregatedDiffs(operationObject.security),
            ...extractAggregatedDiffs(operationObject.externalDocs),
            ...extractAggregatedDiffs(operationObject.bindings),
            ...extractAggregatedDiffs(operationObject.reply),
            // traits are merged into operation's own properties by normalization,
            // so trait diffs surface via extractOwnDiffs(operationObject) above.
            // channel subtrees (shared uniformly across operations on the channel):
            ...extractAggregatedDiffs(channel.parameters),
            ...extractAggregatedDiffs(channel.externalDocs),
            ...extractAggregatedDiffs(channel.bindings),
            ...extractAggregatedDiffs(channel.tags),
            ...asyncApiVersionDiffs,
            ...infoDiffs,
            ...idDiffs,
          ]
        }
        if (operationAddedOrRemoved) {
          // Level 1: message added/removed within an existing operation (analogous to REST method within path)
          const messageAddedOrRemovedDiff = (messages as WithDiffMetaRecord<AsyncAPIV3.MessageObject[]>)[DIFF_META_KEY]?.[messageIndex]
          // Level 2: entire operation added/removed (analogous to REST entire path)
          const operationAddedOrRemovedDiff = (asyncOperations as WithDiffMetaRecord<AsyncAPIV3.OperationsObject>)[DIFF_META_KEY]?.[asyncOperationId]
          const diff = messageAddedOrRemovedDiff ?? operationAddedOrRemovedDiff
          if (diff) {
            operationDiffs.push(diff)
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
  }

  let comparisonDocument: ComparisonDocument | undefined
  if (operationChanges.length) {
    comparisonDocument = createComparisonDocument(comparisonInternalDocumentId, merged)
  }

  return {
    operationChanges,
    tags,
    ...(comparisonDocument ? { comparisonDocument } : {}),
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
      Object.entries(operations).map(([key, operation]) => [key, { ...operation, messages: [] }]),
    ) : {},
    ...rest,
  }
}

