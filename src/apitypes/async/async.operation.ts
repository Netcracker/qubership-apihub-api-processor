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
import { ORIGINS_SYMBOL, VERSION_STATUS } from '../../consts'
import { getCustomTags, resolveApiAudience } from '../../utils/apihubSpecificationExtensions'
import { DebugPerformanceContext, syncDebugPerformance } from '../../utils/logs'
import {
  ASYNCAPI_PROPERTY_CHANNELS,
  ASYNCAPI_PROPERTY_COMPONENTS,
  ASYNCAPI_PROPERTY_MESSAGES,
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
import { calculateAsyncApiKind, extractKeyAfterPrefix, extractProtocol, getAsyncChannelId } from './async.utils'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/esm/spec-types'
import { getApiKindProperty } from '../../components/document'
import { calculateTolerantHash } from '../../components/deprecated'
import { ASYNCAPI_API_TYPE, ASYNCAPI_DEPRECATION_EXTENSION_KEY, DEPRECATED_MESSAGE_PREFIX } from './async.consts'

export const buildAsyncApiOperation = (
  operationId: string,
  messageId: string,
  operationKey: string,
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
  const effectiveOperationObject: AsyncAPIV3.OperationObject = effectiveDocument.operations?.[operationKey] as AsyncAPIV3.OperationObject || {}
  const effectiveSingleOperationSpec = createOperationSpec(effectiveDocument, operationKey)

  // TODO Out of scope
  const tags: string[] = effectiveOperationObject?.tags?.map(tag => (tag as AsyncAPIV3.TagObject)?.name) || []

  // Extract search scopes (similar to REST)
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

  const deprecatedItems: DeprecateItem[] = []
  syncDebugPerformance('[DeprecatedItems]', () => {
    const [version] = getSplittedVersionKey(config.version)
    const deprecatedInPreviousVersions = config.status === VERSION_STATUS.RELEASE ? [version] : []

    const resolveDeclarationJsonPaths = (value: Jso): JsonPath[] => (
      resolveOrigins(value, ASYNCAPI_DEPRECATION_EXTENSION_KEY, ORIGINS_SYMBOL)?.map(pathItemToFullPath) ?? []
    )

    if (message[ASYNCAPI_DEPRECATION_EXTENSION_KEY]) {
      const declarationJsonPaths = resolveDeclarationJsonPaths(message as Jso)
      const messageTitle = message.title || extractKeyAfterPrefix(declarationJsonPaths, [ASYNCAPI_PROPERTY_COMPONENTS, ASYNCAPI_PROPERTY_MESSAGES])

      deprecatedItems.push({
        declarationJsonPaths,
        description: `${DEPRECATED_MESSAGE_PREFIX} message '${messageTitle}'`,
        ...{ [isOperationDeprecated]: true },
        deprecatedInPreviousVersions,
      })
    }

    if (channel[ASYNCAPI_DEPRECATION_EXTENSION_KEY]) {
      const declarationJsonPaths = resolveDeclarationJsonPaths(channel as Jso)
      const channelTitle = channel.title || extractKeyAfterPrefix(declarationJsonPaths, [ASYNCAPI_PROPERTY_CHANNELS])

      deprecatedItems.push({
        declarationJsonPaths,
        description: `${DEPRECATED_MESSAGE_PREFIX} channel '${channelTitle}'`,
        deprecatedInPreviousVersions,
        hash: calculateHash(channel, normalizedSpecFragmentsHashCache),
        tolerantHash: calculateTolerantHash(channel as Jso, notifications),
      })
    }

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

  const operationApiKind = getApiKindProperty(effectiveOperationObject)
  const channelApiKind = getApiKindProperty(channel)

  // TODO: Populate models when AsyncAPI model extraction is implemented
  const models: Record<string, string> = {}
  const specWithSingleOperation = syncDebugPerformance('[ModelsAndOperationHashing]', () => {
    return createOperationSpec(
      documentData,
      operationKey,
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
    deprecated: !!message[ASYNCAPI_DEPRECATION_EXTENSION_KEY],
    title: message.title || messageId,
    metadata: {
      action,
      channel: channel.title || getAsyncChannelId(channel),
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
 * Creates an operation spec (a cropped AsyncAPI document) that contains only the requested operation(s).
 *
 * By default, the returned object includes only `asyncapi`, `info`, and `operations`.
 * If `refsDocument` is provided and contains inline refs for all requested operations, the function
 * will also inline referenced `channels`, `servers`, and `components` from the original `document`.
 *
 * @param document AsyncAPI 3.0 document to crop.
 * @param operationKey Operation key or an array of operation keys to include.
 * @param refsDocument Optional "refs-only" document used to detect inline refs that must be copied.
 * @throws Error when the document has no `operations`, when no operation keys are provided, or when any
 *         requested operation key is missing in the document.
 */
export const createOperationSpec = (
  document: AsyncAPIV3.AsyncAPIObject,
  operationKey: string | string[],
  refsDocument?: AsyncAPIV3.AsyncAPIObject,
): TYPE.AsyncOperationData => {
  const operations = document?.operations
  if (!operations) {
    throw new Error(
      'AsyncAPI document has no operations. Expected a non-empty "operations" object at document.operations.',
    )
  }

  const operationKeys = Array.isArray(operationKey) ? operationKey : [operationKey]
  if (operationKeys.length === 0) {
    throw new Error(
      'No operation keys provided. Pass a non-empty operation key string or a non-empty array of operation keys.',
    )
  }

  const missingOperationKeys: string[] = []
  const selectedOperations: Record<string, AsyncAPIV3.OperationObject> = {}
  for (const key of operationKeys) {
    const operation = operations[key] as AsyncAPIV3.OperationObject | undefined
    if (!operation) {
      missingOperationKeys.push(key)
      continue
    }
    selectedOperations[key] = operation
  }

  if (missingOperationKeys.length > 0) {
    if (!Array.isArray(operationKey) && missingOperationKeys.length === 1) {
      throw new Error(
        `Operation "${missingOperationKeys[0]}" not found in document.operations`,
      )
    }
    throw new Error(
      `Operations not found in document.operations: ${missingOperationKeys.join(', ')}`,
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
  for (const key of operationKeys) {
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
