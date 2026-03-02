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

import { JsonPath, syncCrawl } from '@netcracker/qubership-apihub-json-crawl'
import type * as TYPE from './async.types'
import { AsyncOperationActionType, VersionAsyncOperation } from './async.types'
import { BuildConfig, DeprecateItem, NotificationMessage, SearchScopes } from '../../types'
import {
  getInlineRefsFomDocument,
  getKeyValue,
  getSplittedVersionKey,
  isDeprecatedOperationItem,
  isOperationDeprecated,
  setValueByPath,
  takeIf,
} from '../../utils'
import {
  DEPRECATED_MESSAGE_PREFIX,
  DEPRECATED_SPECIFICATION_EXTENSION,
  ORIGINS_SYMBOL,
  VERSION_STATUS,
} from '../../consts'
import { getCustomTags, resolveApiAudience } from '../../utils/apihubSpecificationExtensions'
import { DebugPerformanceContext, syncDebugPerformance } from '../../utils/logs'
import {
  ASYNCAPI_PROPERTY_CHANNELS,
  ASYNCAPI_PROPERTY_COMPONENTS,
  ASYNCAPI_PROPERTY_SERVERS,
  calculateDeprecatedItems,
  grepValue,
  Jso,
  JSON_SCHEMA_PROPERTY_DEPRECATED,
  matchPaths,
  parseRef,
  pathItemToFullPath,
  PREDICATE_ANY_VALUE,
  PREDICATE_UNCLOSED_END,
  resolveOrigins,
} from '@netcracker/qubership-apihub-api-unifier'
import { calculateHash, ObjectHashCache } from '../../utils/hashes'
import { calculateAsyncApiKind, extractProtocol } from './async.utils'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/esm/spec-types'
import { getApiKindProperty } from '../../components/document'
import { calculateTolerantHash } from '../../components/deprecated'
import { ASYNC_KIND_KEY, ASYNCAPI_API_TYPE } from './async.consts'

export const buildAsyncApiOperation = (
  operationId: string,
  messageId: string,
  channelId: string,
  asyncOperationId: string,
  action: AsyncOperationActionType,
  channel: AsyncAPIV3.ChannelObject,
  message: AsyncAPIV3.MessageObject,
  document: TYPE.VersionAsyncDocument,
  effectiveDocument: AsyncAPIV3.AsyncAPIObject,
  refsOnlyDocument: AsyncAPIV3.AsyncAPIObject,
  notifications: NotificationMessage[],
  config: BuildConfig,
  normalizedSpecFragmentsHashCache: ObjectHashCache,
  debugCtx?: DebugPerformanceContext,
): VersionAsyncOperation => {
  const {
    data: documentData,
    slug: documentSlug,
    versionInternalDocument,
    metadata: documentMetadata,
  } = document
  const effectiveOperationObject: AsyncAPIV3.OperationObject = effectiveDocument.operations?.[asyncOperationId] as AsyncAPIV3.OperationObject || {}
  const effectiveSingleOperationSpec = createOperationSpec(effectiveDocument, asyncOperationId)

  // TODO Out of scope
  const tags: string[] = effectiveOperationObject?.tags?.map(tag => (tag as AsyncAPIV3.TagObject)?.name) || []

  // TODO Extract search scopes (similar to REST)
  const scopes: SearchScopes = {}
  syncDebugPerformance('[SearchScopes]', () => {
    const handledObject = new Set<unknown>()
    syncCrawl(
      effectiveOperationObject,
      ({ key, value }) => {
        if (typeof key === 'symbol') {
          return { done: true }
        }
        if (handledObject.has(value)) {
          return { done: true }
        }
        handledObject.add(value)
        // For AsyncAPI, we could build search scopes for messages, but for now keep it simple
        return { value }
      },
    )
  }, debugCtx)

  const deprecatedItems = collectDeprecatedItems(
    config, message, messageId, channel, channelId,
    effectiveSingleOperationSpec, normalizedSpecFragmentsHashCache,
    notifications, debugCtx,
  )

  const operationApiKind = getApiKindProperty(effectiveOperationObject, ASYNC_KIND_KEY)
  const channelApiKind = getApiKindProperty(channel, ASYNC_KIND_KEY)

  // TODO: Populate models when AsyncAPI model extraction is implemented
  const models: Record<string, string> = {}
  const specWithSingleOperation = syncDebugPerformance('[ModelsAndOperationHashing]', () => {
    return createOperationSpec(
      documentData,
      asyncOperationId,
      refsOnlyDocument,
    )
  }, debugCtx)

  const deprecatedOperationItem = deprecatedItems.find(isDeprecatedOperationItem)

  // Extract custom tags
  const customTags = getCustomTags(effectiveOperationObject)

  // Resolve API audience
  const apiAudience = resolveApiAudience(documentMetadata?.info)

  const protocol = extractProtocol(channel)

  return {
    operationId,
    documentId: documentSlug,
    apiType: ASYNCAPI_API_TYPE,
    apiKind: calculateAsyncApiKind(operationApiKind, channelApiKind),
    deprecated: !!message[DEPRECATED_SPECIFICATION_EXTENSION],
    title: message.title || messageId,
    metadata: {
      action,
      channel: channel.title || channelId,
      protocol,
      customTags,
    },
    tags,
    data: specWithSingleOperation,
    searchScopes: scopes,
    deprecatedItems,
    models,
    ...takeIf({
      deprecatedInfo: deprecatedOperationItem?.deprecatedInfo,
      deprecatedInPreviousVersions: deprecatedOperationItem?.deprecatedInPreviousVersions,
    }, !!deprecatedOperationItem),
    apiAudience,
    versionInternalDocumentId: versionInternalDocument.versionDocumentId,
  }
}

/**
 * Collects deprecation data for an AsyncAPI 3.0 operation.
 *
 * In AsyncAPI 3.0, native `deprecated: true` exists only on Schema Object (JSON Schema).
 * For Message and Channel objects, deprecation is expressed via the custom `x-deprecated` extension.
 *
 * **Message deprecation** (`x-deprecated` on Message Object):
 * If the resolved message has `x-deprecated: true`, the APIHUB operation is treated as
 * deprecated.
 *
 * **Channel deprecation** (`x-deprecated` on Channel Object):
 * If the channel has `x-deprecated: true`, the channel are treated as channel-deprecated.
 */
const collectDeprecatedItems = (
  config: BuildConfig,
  message: AsyncAPIV3.MessageObject,
  messageId: string,
  channel: AsyncAPIV3.ChannelObject,
  channelId: string,
  effectiveSingleOperationSpec: TYPE.AsyncOperationData,
  normalizedSpecFragmentsHashCache: ObjectHashCache,
  notifications: NotificationMessage[],
  debugCtx?: DebugPerformanceContext,
): DeprecateItem[] => {

  const deprecatedItems: DeprecateItem[] = []
  syncDebugPerformance('[DeprecatedItems]', () => {
    const [version] = getSplittedVersionKey(config.version)
    const deprecatedInPreviousVersions = config.status === VERSION_STATUS.RELEASE ? [version] : []

    const resolveDeclarationJsonPaths = (value: Jso): JsonPath[] => (
      resolveOrigins(value, DEPRECATED_SPECIFICATION_EXTENSION, ORIGINS_SYMBOL)?.map(pathItemToFullPath) ?? []
    )

    // Handled Custom extensions (x-deprecated) on Message
    if (message[DEPRECATED_SPECIFICATION_EXTENSION]) {
      const declarationJsonPaths = resolveDeclarationJsonPaths(message as Jso)
      const messageTitle = message.title || messageId

      deprecatedItems.push({
        declarationJsonPaths,
        description: `${DEPRECATED_MESSAGE_PREFIX} message '${messageTitle}'`,
        ...{ [isOperationDeprecated]: true },
        deprecatedInPreviousVersions,
      })
    }
    // Handled Custom extensions (x-deprecated) on Channel
    if (channel[DEPRECATED_SPECIFICATION_EXTENSION]) {
      const declarationJsonPaths = resolveDeclarationJsonPaths(channel as Jso)
      const channelTitle = channel.title || channelId

      deprecatedItems.push({
        declarationJsonPaths,
        description: `${DEPRECATED_MESSAGE_PREFIX} channel '${channelTitle}'`,
        deprecatedInPreviousVersions,
        hash: calculateHash(channel, normalizedSpecFragmentsHashCache),
        tolerantHash: calculateTolerantHash(channel as Jso, notifications),
      })
    }

    // Native `deprecated: true` on Schema Objects in payload/headers — calculated by api-unifier
    const foundDeprecatedItems = calculateDeprecatedItems(effectiveSingleOperationSpec, ORIGINS_SYMBOL)
    for (const item of foundDeprecatedItems) {
      const { description, value } = item
      const declarationJsonPaths = resolveOrigins(value, JSON_SCHEMA_PROPERTY_DEPRECATED, ORIGINS_SYMBOL)?.map(pathItemToFullPath) ?? []

      deprecatedItems.push({
        declarationJsonPaths,
        description,
        deprecatedInPreviousVersions,
        hash: calculateHash(value, normalizedSpecFragmentsHashCache),
        tolerantHash: calculateTolerantHash(value as Jso, notifications),
      })
    }
  }, debugCtx)

  return deprecatedItems
}

/**
 * Creates an operation spec (a cropped AsyncAPI document) that contains only the requested operation(s).
 *
 * By default, the returned object includes only `asyncapi`, `info`, and `operations`.
 * If `refsDocument` is provided and contains inline refs for all requested operations, the function
 * will also inline referenced `channels`, `servers`, and `components` from the original `document`.
 *
 * @param document AsyncAPI 3.0 document to crop.
 * @param asyncOperationId Operation key or an array of operation keys to include.
 * @param refsDocument Optional "refs-only" document used to detect inline refs that must be copied.
 * @throws Error when the document has no `operations`, when no operation keys are provided, or when any
 *         requested operation key is missing in the document.
 */
export const createOperationSpec = (
  document: AsyncAPIV3.AsyncAPIObject,
  asyncOperationId: string | string[],
  refsDocument?: AsyncAPIV3.AsyncAPIObject,
): TYPE.AsyncOperationData => {
  const operations = document?.operations
  if (!operations) {
    throw new Error(
      'AsyncAPI document has no operations. Expected a non-empty "operations" object at document.operations.',
    )
  }

  const asyncOperationIds = Array.isArray(asyncOperationId) ? asyncOperationId : [asyncOperationId]
  if (asyncOperationIds.length === 0) {
    throw new Error(
      'No operation keys provided. Pass a non-empty operation key string or a non-empty array of operation keys.',
    )
  }

  const missingAsyncOperationIds: string[] = []
  const selectedOperations: Record<string, AsyncAPIV3.OperationObject> = {}
  for (const key of asyncOperationIds) {
    const operation = operations[key] as AsyncAPIV3.OperationObject | undefined
    if (!operation) {
      missingAsyncOperationIds.push(key)
      continue
    }
    selectedOperations[key] = operation
  }

  if (missingAsyncOperationIds.length > 0) {
    if (!Array.isArray(asyncOperationId) && missingAsyncOperationIds.length === 1) {
      throw new Error(
        `Operation "${missingAsyncOperationIds[0]}" not found in document.operations`,
      )
    }
    throw new Error(
      `Operations not found in document.operations: ${missingAsyncOperationIds.join(', ')}`,
    )
  }

  const resultSpec: TYPE.AsyncOperationData = {
    asyncapi: document.asyncapi || '3.0.0',
    info: document.info,
    operations: selectedOperations,
  }

  const refsOnlyOperations = refsDocument?.operations
  if (!refsOnlyOperations) {
    return resultSpec
  }

  // If there are not enough operations, we will get an incorrect result.
  for (const key of asyncOperationIds) {
    if (!refsOnlyOperations[key]) {
      return resultSpec
    }
  }
  const inlineRefs = getInlineRefsFomDocument(refsDocument)

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
    const component = getKeyValue(document, ...matchResult.path) as Record<string, unknown>
    if (!component) {
      return
    }
    setValueByPath(resultSpec, matchResult.path, component)
  })
  return resultSpec
}
