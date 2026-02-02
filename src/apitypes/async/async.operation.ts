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
  calculateDeprecatedItems,
  JSON_SCHEMA_PROPERTY_DEPRECATED,
  matchPaths,
  OPEN_API_PROPERTY_PATHS,
  pathItemToFullPath,
  PREDICATE_ANY_VALUE,
  resolveOrigins,
} from '@netcracker/qubership-apihub-api-unifier'
import { calculateHash, ObjectHashCache } from '../../utils/hashes'
import { extractProtocol } from './async.utils'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/esm/spec-types'
import { getApiKindProperty } from '../../components/document'
import { AsyncOperationActionType, VersionAsyncOperation } from './async.types'

export const buildAsyncApiOperation = (
  operationId: string,
  operationKey: string,
  action: AsyncOperationActionType,
  channel: AsyncAPIV3.ChannelObject,
  document: TYPE.VersionAsyncDocument,
  effectiveDocument: AsyncAPIV3.AsyncAPIObject,
  refsOnlyDocument: AsyncAPIV3.AsyncAPIObject,
  notifications: NotificationMessage[],
  config: BuildConfig,
  normalizedSpecFragmentsHashCache: ObjectHashCache,
  debugCtx?: DebugPerformanceContext,
): VersionAsyncOperation => {
  const { apiKind: documentApiKind, data: documentData, slug: documentSlug, versionInternalDocument, metadata: documentMetadata } = document
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

  // TODO: Need to understand how to handle deprecations in AsyncAPI operations properly
  const deprecatedItems: DeprecateItem[] = []
  syncDebugPerformance('[DeprecatedItems]', () => {
    const foundedDeprecatedItems = calculateDeprecatedItems(effectiveSingleOperationSpec, ORIGINS_SYMBOL)

    for (const item of foundedDeprecatedItems) {
      const { description, deprecatedReason, value } = item

      const declarationJsonPaths = resolveOrigins(value, JSON_SCHEMA_PROPERTY_DEPRECATED, ORIGINS_SYMBOL)?.map(pathItemToFullPath) ?? []
      const isOperation = isOperationPaths(declarationJsonPaths)
      const [version] = getSplittedVersionKey(config.version)

      const tolerantHash = undefined // Skip tolerant hash for now
      const hash = isOperation ? undefined : calculateHash(value, normalizedSpecFragmentsHashCache)

      deprecatedItems.push({
        declarationJsonPaths,
        description,
        ...takeIfDefined({ deprecatedInfo: deprecatedReason }),
        ...takeIf({ [isOperationDeprecated]: true }, isOperation),
        deprecatedInPreviousVersions: config.status === VERSION_STATUS.RELEASE ? [version] : [],
        ...takeIfDefined({ hash: hash }),
        ...takeIfDefined({ tolerantHash: tolerantHash }),
      })
    }
  }, debugCtx)

  const operationApiKind = getApiKindProperty(effectiveOperationObject)

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
    apiKind: operationApiKind || documentApiKind || APIHUB_API_COMPATIBILITY_KIND_BWC,
    //todo check deprecated
    deprecated: false,
    // TODO check title, we changed it in release
    title: effectiveOperationObject.title || effectiveOperationObject.summary || operationKey.split('-').map(str => capitalize(str)).join(' '),
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

const isOperationPaths = (paths: JsonPath[]): boolean => {
  return !!matchPaths(
    paths,
    [[OPEN_API_PROPERTY_PATHS, PREDICATE_ANY_VALUE, PREDICATE_ANY_VALUE, PREDICATE_ANY_VALUE]],
  )
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

