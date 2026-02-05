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
  capitalize,
  getSplittedVersionKey,
  isDeprecatedOperationItem,
  isOperationDeprecated,
  takeIf,
  takeIfDefined,
} from '../../utils'
import { APIHUB_API_COMPATIBILITY_KIND_BWC, ORIGINS_SYMBOL, VERSION_STATUS } from '../../consts'
import { getCustomTags, resolveApiAudience } from '../../utils/apihubSpecificationExtensions'
import { DebugPerformanceContext, syncDebugPerformance } from '../../utils/logs'
import {
  ASYNCAPI_PROPERTY_CHANNELS,
  ASYNCAPI_PROPERTY_COMPONENTS,
  ASYNCAPI_PROPERTY_MESSAGES,
  calculateDeprecatedItems,
  Jso,
  JSON_SCHEMA_PROPERTY_DEPRECATED,
  pathItemToFullPath,
  resolveOrigins,
} from '@netcracker/qubership-apihub-api-unifier'
import { calculateHash, ObjectHashCache } from '../../utils/hashes'
import { extractProtocol } from './async.utils'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/esm/spec-types'
import { getApiKindProperty } from '../../components/document'
import { calculateTolerantHash } from '../../components/deprecated'
import { ASYNCAPI_DEPRECATION_EXTENSION_KEY, DEPRECATED_MESSAGE_PREFIX } from './async.consts'

export const buildAsyncApiOperation = (
  operationId: string,
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
    apiKind: documentApiKind,
    data: documentData,
    slug: documentSlug,
    versionInternalDocument,
    metadata: documentMetadata,
  } = document
  const { servers, components } = documentData
  const effectiveOperationObject: AsyncAPIV3.OperationObject = effectiveDocument.operations?.[operationKey] as AsyncAPIV3.OperationObject || {}
  const effectiveSingleOperationSpec = createSingleOperationSpec(effectiveDocument, operationKey)

  // TODO check tags. Its more complex in AsyncAPI
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
      const messageId = extractKeyAfterPrefix(declarationJsonPaths, [ASYNCAPI_PROPERTY_COMPONENTS, ASYNCAPI_PROPERTY_MESSAGES])

      deprecatedItems.push({
        declarationJsonPaths,
        description: `${DEPRECATED_MESSAGE_PREFIX} message '${message.title || messageId || operationId}'`,
        ...{ [isOperationDeprecated]: true },
        deprecatedInPreviousVersions,
      })
    }

    if (channel[ASYNCAPI_DEPRECATION_EXTENSION_KEY]) {
      const declarationJsonPaths = resolveDeclarationJsonPaths(channel as Jso)
      const channelId = extractKeyAfterPrefix(declarationJsonPaths, [ASYNCAPI_PROPERTY_CHANNELS])

      deprecatedItems.push({
        declarationJsonPaths,
        description: `${DEPRECATED_MESSAGE_PREFIX} channel '${channelId || operationId}'`,
        deprecatedInPreviousVersions,
        hash: calculateHash(channel, normalizedSpecFragmentsHashCache),
        tolerantHash: calculateTolerantHash(channel as Jso, notifications),
      })
    }

    const foundedDeprecatedItems = calculateDeprecatedItems(effectiveSingleOperationSpec, ORIGINS_SYMBOL)
    for (const item of foundedDeprecatedItems) {
      const { description, value } = item
      const declarationJsonPaths = resolveOrigins(value, JSON_SCHEMA_PROPERTY_DEPRECATED, ORIGINS_SYMBOL)?.map(pathItemToFullPath) ?? []
      const tolerantHash = calculateTolerantHash(value, notifications)
      const hash = calculateHash(value, normalizedSpecFragmentsHashCache)

      deprecatedItems.push({
        declarationJsonPaths,
        description,
        deprecatedInPreviousVersions,
        ...takeIfDefined({ hash: hash }),
        ...takeIfDefined({ tolerantHash: tolerantHash }),
      })
    }
  }, debugCtx)

  const operationApiKind = getApiKindProperty(effectiveOperationObject)
  const channelApiKind = getApiKindProperty(channel)

  const models: Record<string, string> = {}
  const [specWithSingleOperation] = syncDebugPerformance('[ModelsAndOperationHashing]', () => {
    const specWithSingleOperation = createSingleOperationSpec(
      documentData,
      operationKey,
      servers,
      components,
    )
    // For AsyncAPI, we could calculate spec refs similar to REST, but keeping it simple for now
    return [specWithSingleOperation]
  }, debugCtx)

  const deprecatedOperationItem = deprecatedItems.find(isDeprecatedOperationItem)

  // Extract custom tags
  const customTags = getCustomTags(effectiveOperationObject)

  // Resolve API audience
  const apiAudience = resolveApiAudience(documentMetadata?.info)

  // Extract protocol from servers or channel bindings
  const protocol = extractProtocol(effectiveDocument, channel)

  return {
    operationId,
    documentId: documentSlug,
    apiType: 'asyncapi',
    apiKind: channelApiKind || operationApiKind || documentApiKind || APIHUB_API_COMPATIBILITY_KIND_BWC,
    deprecated: !!message[ASYNCAPI_DEPRECATION_EXTENSION_KEY],
    // TODO check title, we changed it in release
    title: message.title || operationKey.split('-').map(str => capitalize(str)).join(' '),
    metadata: {
      action,
      // TODO check channel name extraction
      channel: '',
      // channel: channel,
      // message: message,
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
 * Creates a single operation spec from AsyncAPI document
 * Crops the document to contain only the specific operation
 */
export const createSingleOperationSpec = (
  document: AsyncAPIV3.AsyncAPIObject,
  operationKey: string,
  servers?: AsyncAPIV3.ServersObject,
  components?: AsyncAPIV3.ComponentsObject,
): TYPE.AsyncOperationData => {
  const operation = document.operations?.[operationKey]

  if (!operation) {
    throw new Error(`Operation ${operationKey} not found in document`)
  }

  return {
    asyncapi: document.asyncapi || '3.0.0',
    info: document.info,
    ...takeIfDefined({ servers }),
    operations: {
      [operationKey]: operation,
    },
    channels: document.channels,
    ...takeIfDefined({ components }),
  }
}

// todo move?
const extractKeyAfterPrefix = (paths: JsonPath[], prefix: PropertyKey[]): string | undefined => {
  for (const path of paths) {
    if (path.length <= prefix.length) {
      continue
    }
    let matches = true
    for (let i = 0; i < prefix.length; i++) {
      if (path[i] !== prefix[i]) {
        matches = false
        break
      }
    }
    if (!matches) {
      continue
    }
    const key = path[prefix.length]
    return key === undefined ? undefined : String(key)
  }
  return undefined
}
