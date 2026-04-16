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

import { v3 as AsyncAPIV3 } from '@asyncapi/parser/esm/spec-types'
import {
  calculateAsyncOperationId,
  getInlineRefsFomDocument,
  getKeyValue,
  getSymbolValueIfDefined,
  isObject,
  isReferenceObject,
  setValueByPath,
  takeIfDefined,
} from '../../utils'
import type * as TYPE from './async.types'
import { AsyncOperationData } from './async.types'
import {
  ASYNCAPI_PROPERTY_CHANNELS,
  ASYNCAPI_PROPERTY_COMPONENTS,
  ASYNCAPI_PROPERTY_SERVERS,
  grepValue,
  matchPaths,
  normalize,
  parseRef,
  PREDICATE_ANY_VALUE,
  PREDICATE_UNCLOSED_END,
} from '@netcracker/qubership-apihub-api-unifier'
import {
  APIHUB_API_COMPATIBILITY_KIND_BWC,
  ApihubApiCompatibilityKind,
  FIRST_REFERENCE_KEY_PROPERTY,
  INLINE_REFS_FLAG,
} from '../../consts'
import { WithAggregatedDiffs, WithDiffMetaRecord } from '../../types'
import { Diff, DIFF_META_KEY, DIFFS_AGGREGATED_META_KEY } from '@netcracker/qubership-apihub-api-diff'

import { getCustomTags } from '../../utils/apihubSpecificationExtensions'

// Re-export shared utilities
export { dump, getCustomTags, resolveApiAudience } from '../../utils/apihubSpecificationExtensions'

/**
 * Extracts protocol from AsyncAPI document servers or channel bindings
 * @param channel - Channel object to extract protocol from
 * @returns Protocol string (e.g., 'kafka', 'amqp', 'mqtt') or 'unknown'
 */
export function extractProtocol(channel: AsyncAPIV3.ChannelObject): string {
  if (!isObject(channel.servers)) {
    return 'unknown'
  }
  for (const server of Object.values(channel.servers as AsyncAPIV3.ServerObject[])) {
    if (isServerObject(server) && server.protocol) {
      const { protocol } = server
      return protocol
    }
  }

  return 'unknown'
}

function isServerObject(obj: AsyncAPIV3.ServerObject | AsyncAPIV3.ReferenceObject): obj is AsyncAPIV3.ServerObject {
  return isObject(obj) && !isReferenceObject(obj)
}

function isTagObject(obj: AsyncAPIV3.TagObject | AsyncAPIV3.ReferenceObject): obj is AsyncAPIV3.TagObject {
  return isObject(obj) && !isReferenceObject(obj)
}

export function isMessageObject(obj: AsyncAPIV3.MessageObject | AsyncAPIV3.ReferenceObject): obj is AsyncAPIV3.MessageObject {
  return isObject(obj) && !isReferenceObject(obj)
}

function isExternalDocumentationObject(item: AsyncAPIV3.ExternalDocumentationObject | AsyncAPIV3.ReferenceObject): item is AsyncAPIV3.ExternalDocumentationObject {
  return (item as AsyncAPIV3.ExternalDocumentationObject).url !== undefined
}

export function toTagObjects(
  data: AsyncAPIV3.AsyncAPIObject,
): AsyncAPIV3.TagObject[] {
  return data?.info?.tags?.map(item => {
    if (isTagObject(item)) {
      return item
    }

    return normalize(item, {
      source: data,
    }) as AsyncAPIV3.TagObject
  }) ?? []
}

export function toExternalDocumentationObject(
  data: AsyncAPIV3.AsyncAPIObject,
): AsyncAPIV3.ExternalDocumentationObject | undefined {
  const externalDocs = data?.info?.externalDocs
  if (!externalDocs) {
    return undefined
  }

  return isExternalDocumentationObject(externalDocs)
    ? externalDocs
    : normalize(externalDocs, {
      source: data,
    }) as AsyncAPIV3.ExternalDocumentationObject
}

export const calculateAsyncApiKind = (
  operationApiKind: ApihubApiCompatibilityKind | undefined,
  channelApiKind: ApihubApiCompatibilityKind | undefined,
): ApihubApiCompatibilityKind => {
  return operationApiKind || channelApiKind || APIHUB_API_COMPATIBILITY_KIND_BWC
}

const getAsyncObjectId = (item: AsyncAPIV3.ChannelObject | AsyncAPIV3.MessageObject): string => {
  return (item as Record<symbol, string>)[FIRST_REFERENCE_KEY_PROPERTY]
}

export const getAsyncMessageId = (message: AsyncAPIV3.MessageObject): string => {
  return getAsyncObjectId(message)
}
export const getAsyncChannelId = (channel: AsyncAPIV3.ChannelObject): string => {
  return getAsyncObjectId(channel)
}

/**
 * Returns a filtered copy of the channel, creating one if it doesn't exist yet.
 * All operations that share the same source channel will get the same filtered instance,
 * accumulating only the messages that are actually requested.
 */
export const getOrCreateFilteredChannel = (
  channelCache: Map<AsyncAPIV3.ChannelObject, AsyncAPIV3.ChannelObject>,
  sourceChannel: AsyncAPIV3.ChannelObject,
  messageId: string,
): AsyncAPIV3.ChannelObject => {
  let filteredChannel = channelCache.get(sourceChannel)
  if (!filteredChannel) {
    filteredChannel = { ...sourceChannel, messages: { [messageId]: sourceChannel.messages![messageId] } }
    channelCache.set(sourceChannel, filteredChannel)
  } else {
    filteredChannel.messages![messageId] = sourceChannel.messages![messageId]
  }
  return filteredChannel
}

/**
 * Builds the root `channels` record for a cropped spec by picking only the
 * source channels that have a filtered counterpart, keyed by their original name.
 */
export const buildFilteredChannelsRecord = (
  sourceChannels: AsyncAPIV3.ChannelsObject | undefined,
  filteredChannels: Map<AsyncAPIV3.ChannelObject, AsyncAPIV3.ChannelObject>,
): Record<string, AsyncAPIV3.ChannelObject> | undefined => {
  if (filteredChannels.size === 0 || !sourceChannels) {
    return undefined
  }
  const channels: Record<string, AsyncAPIV3.ChannelObject> = {}
  for (const [channelName, channelObj] of Object.entries(sourceChannels)) {
    const filteredChannel = filteredChannels.get(channelObj as AsyncAPIV3.ChannelObject)
    if (filteredChannel) {
      channels[channelName] = filteredChannel
    }
  }
  return channels
}

export const checkHasAsyncApiOperations = (
  document: AsyncAPIV3.AsyncAPIObject | TYPE.AsyncOperationData,
): Record<string, AsyncAPIV3.OperationObject> => {
  const operations = document?.operations
  if (!operations) {
    throw new Error(
      'AsyncAPI document has no operations. Expected non-empty "operations".',
    )
  }
  return operations as Record<string, AsyncAPIV3.OperationObject>
}

/**
 * Creates the base AsyncAPI operation spec containing only the essential
 * contract elements: version, info, operations, and channels.
 *
 * Root-level specification extensions (`x-*`) from the source document are
 * carried over as-is (via {@link getCustomTags}).
 *
 * `defaultContentType` is NOT copied from the document automatically — callers
 * must decide whether to include it (see {@link getRequiredDefaultContentType}).
 */
export const createBaseAsyncApiSpec = (
  document: AsyncAPIV3.AsyncAPIObject,
  operations: Record<string, AsyncAPIV3.OperationObject>,
  channels?: AsyncAPIV3.ChannelsObject,
  defaultContentType?: string,
): TYPE.AsyncOperationData => ({
  asyncapi: document.asyncapi || '3.0.0',
  info: document.info,
  ...takeIfDefined({ id: document.id }),
  ...takeIfDefined({ defaultContentType }),
  ...takeIfDefined({ channels }),
  operations,
  ...getCustomTags(document),
})

/**
 * Computes the effective root `defaultContentType` for a composed operation spec.
 *
 * Rule (per design): include the source document's `defaultContentType` only when
 * at least one of the selected messages does not specify its own `contentType`.
 * If every selected message already carries an explicit `contentType`, the root
 * value would be redundant and is omitted.
 */
export const getRequiredDefaultContentType = (
  document: AsyncAPIV3.AsyncAPIObject,
  selectedMessages: AsyncAPIV3.MessageObject[],
): string | undefined => {
  const rootDefault = document.defaultContentType
  if (!rootDefault) { return undefined }
  const anyMessageLacksContentType = selectedMessages.some(message => !message.contentType)
  return anyMessageLacksContentType ? rootDefault : undefined
}

export const enrichAsyncApiDocumentWithRefs = (
  resultSpec: AsyncOperationData,
  document: AsyncAPIV3.AsyncAPIObject,
  refsSource: AsyncOperationData,
): void => {
  const inlineRefs = getInlineRefsFomDocument(refsSource)

  const componentNameMatcher = grepValue('componentName')
  const matchPatterns = [
    [ASYNCAPI_PROPERTY_COMPONENTS, PREDICATE_ANY_VALUE, componentNameMatcher, PREDICATE_UNCLOSED_END],
    [ASYNCAPI_PROPERTY_CHANNELS, componentNameMatcher, PREDICATE_UNCLOSED_END],
    [ASYNCAPI_PROPERTY_SERVERS, componentNameMatcher, PREDICATE_UNCLOSED_END],
  ]

  inlineRefs.forEach(ref => {
    const parsed = parseRef(ref)
    const path = parsed?.jsonPath
    if (!path) {
      return
    }

    const matchResult = matchPaths([path], matchPatterns)
    if (!matchResult) {
      return
    }

    const component = getKeyValue(document, ...matchResult.path)
    if (!component) {
      return
    }

    setValueByPath(resultSpec, matchResult.path, component)
  })
}

export const buildAsyncApiSpecFromDocument = (
  sourceDocument: AsyncAPIV3.AsyncAPIObject,
  resolved: Map<string, Set<string>>,
  refsDocument: TYPE.AsyncOperationData,
): TYPE.AsyncOperationData => {
  const sourceOperations = checkHasAsyncApiOperations(sourceDocument)
  const refsOperations = checkHasAsyncApiOperations(refsDocument)

  const selectedOperations: Record<string, AsyncAPIV3.OperationObject> = {}
  // Resolved messages are collected to decide whether root defaultContentType is needed
  const resolvedMessages: AsyncAPIV3.MessageObject[] = []

  for (const [asyncOperationId, matchedRefs] of resolved.entries()) {
    const sourceOperation = sourceOperations[asyncOperationId]
    if (!sourceOperation || isReferenceObject(sourceOperation)) {
      continue
    }

    const sourceMessages = sourceOperation.messages || []
    const refsMessages = (refsOperations[asyncOperationId]?.messages as AsyncAPIV3.MessageObject[] | undefined) ?? []
    const filteredMessages: (AsyncAPIV3.MessageObject | AsyncAPIV3.ReferenceObject)[] = []

    sourceMessages.forEach((message, index) => {
      if (isReferenceObject(message) && matchedRefs.has(message.$ref)) {
        filteredMessages.push(message)
        const resolvedMessage = refsMessages[index]
        if (resolvedMessage) { resolvedMessages.push(resolvedMessage) }
      }
    })

    if (filteredMessages.length > 0) {
      selectedOperations[asyncOperationId] = {
        ...sourceOperation,
        messages: filteredMessages,
      }
    }
  }

  const defaultContentType = getRequiredDefaultContentType(sourceDocument, resolvedMessages)

  return createBaseAsyncApiSpec(sourceDocument, selectedOperations, undefined, defaultContentType)
}

export const resolveAsyncApiOperationIdsFromRefs = (
  refOperations: Record<string, AsyncAPIV3.OperationObject>,
  requestedOperationIds: string[],
): Map<string, Set<string>> => {
  const requestedIdsSet = new Set(requestedOperationIds)
  const resolved = new Map<string, Set<string>>()

  for (const [asyncOperationId, operationData] of Object.entries(refOperations)) {
    if (!isObject(operationData)) {
      continue
    }

    const { messages } = (operationData as AsyncAPIV3.OperationObject)
    if (!Array.isArray(messages)) {
      continue
    }

    for (const message of messages) {
      if (!isMessageObject(message)) {
        continue
      }
      const inlineRefs = getSymbolValueIfDefined(message, INLINE_REFS_FLAG) as string[] | undefined
      if (!inlineRefs || inlineRefs.length === 0) {
        continue
      }
      const lastInlineRef = inlineRefs.at(-1)
      if (!lastInlineRef) {
        continue
      }

      const messageId = getAsyncMessageId(message)
      const calculatedId = calculateAsyncOperationId(asyncOperationId, messageId)

      if (!requestedIdsSet.has(calculatedId)) {
        continue
      }

      let messageRefsForOperation = resolved.get(asyncOperationId)
      if (!messageRefsForOperation) {
        messageRefsForOperation = new Set()
        resolved.set(asyncOperationId, messageRefsForOperation)
      }

      messageRefsForOperation.add(lastInlineRef)
    }
  }

  return resolved
}

/**
 * Aggregated diffs on the operation level include diffs from ALL messages.
 * Since each apihub operation maps to a specific operation + message pair,
 * diffs from sibling messages must be excluded to prevent them from leaking
 * into unrelated apihub operations.
 *
 * Collects two kinds of diffs that belong exclusively to other messages:
 * 1. Aggregated content diffs from each sibling message object
 * 2. Array-level diffs for adding/removing sibling messages from the messages list
 *
 * Diffs shared between the current message and sibling messages (e.g. from a shared
 * component schema) are NOT included, so they won't be incorrectly filtered out.
 */
export function collectExclusiveOtherMessageDiffs(messages: AsyncAPIV3.MessageObject[], currentMessageIndex: number): Set<Diff> {
  const currentMessageDiffsArr = (messages[currentMessageIndex] as WithAggregatedDiffs<AsyncAPIV3.MessageObject>)[DIFFS_AGGREGATED_META_KEY]
  const currentMessageDiffs = new Set(currentMessageDiffsArr ?? [])

  const otherDiffs = new Set<Diff>()
  for (const [messageIndex, message] of messages.entries()) {
    if (messageIndex === currentMessageIndex) continue
    const messageDiffs = (message as WithAggregatedDiffs<AsyncAPIV3.MessageObject>)[DIFFS_AGGREGATED_META_KEY]
    if (messageDiffs) {
      for (const messageDiff of messageDiffs) {
        if (!currentMessageDiffs.has(messageDiff)) {
          otherDiffs.add(messageDiff)
        }
      }
    }
  }
  const messagesArrayMeta = (messages as WithDiffMetaRecord<AsyncAPIV3.MessageObject[]>)[DIFF_META_KEY]
  if (messagesArrayMeta) {
    for (const key in messagesArrayMeta) {
      if (Number(key) !== currentMessageIndex) {
        otherDiffs.add(messagesArrayMeta[key])
      }
    }
  }
  return otherDiffs
}

/**
 * Collects diffs for adding/removing message definitions in channel.messages.
 * These are channel-level definition changes that should not propagate to operations,
 * because what matters is whether the operation's own messages array references a message,
 * not whether the channel defines it.
 */
export function collectChannelMessageDefinitionDiffs(operationChannel: AsyncAPIV3.ChannelObject): Set<Diff> {
  const channelMessages = (operationChannel as Record<string, unknown>).messages
  if (!isObject(channelMessages)) {
    return new Set()
  }
  const diffs = new Set<Diff>()
  const messagesMeta = (channelMessages as WithDiffMetaRecord<object>)[DIFF_META_KEY]
  if (messagesMeta) {
    for (const key in messagesMeta) {
      diffs.add(messagesMeta[key])
    }
  }
  return diffs
}

export function extractAsyncApiVersionDiff(doc: AsyncAPIV3.AsyncAPIObject): Diff[] {
  const diff = (doc as WithDiffMetaRecord<AsyncAPIV3.AsyncAPIObject>)[DIFF_META_KEY]?.asyncapi
  return diff ? [diff] : []
}

export function extractInfoDiffs(doc: AsyncAPIV3.AsyncAPIObject): Diff[] {
  const addOrRemoveInfoDiff = (doc as WithDiffMetaRecord<AsyncAPIV3.AsyncAPIObject>)[DIFF_META_KEY]?.info
  const infoInternalDiffs = (doc.info as WithAggregatedDiffs<AsyncAPIV3.InfoObject>)?.[DIFFS_AGGREGATED_META_KEY] ?? []
  return [
    ...(addOrRemoveInfoDiff ? [addOrRemoveInfoDiff] : []),
    ...infoInternalDiffs,
  ]
}

export function extractIdDiff(doc: AsyncAPIV3.AsyncAPIObject): Diff[] {
  const diff = (doc as WithDiffMetaRecord<AsyncAPIV3.AsyncAPIObject>)[DIFF_META_KEY]?.id
  return diff ? [diff] : []
}

