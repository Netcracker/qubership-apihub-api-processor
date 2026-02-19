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

import { API_AUDIENCE_EXTERNAL, BuildConfig, DeprecateItem, NotificationMessage } from '../../types'
import {
  getKeyValue,
  getSplittedVersionKey,
  isOperationDeprecated,
  removeComponents,
  setValueByPath,
  takeIf,
  takeIfDefined,
} from '../../utils'
import { APIHUB_API_COMPATIBILITY_KIND_BWC, INLINE_REFS_FLAG, ORIGINS_SYMBOL, VERSION_STATUS } from '../../consts'
import { GraphQLSchemaType, VersionGraphQLDocument, VersionGraphQLOperation } from './graphql.types'
import { GRAPHQL_API_TYPE, GRAPHQL_TYPE, GRAPHQL_TYPE_KEYS } from './graphql.consts'
import { calculateGraphqlOperationId } from '../../utils'
import { GraphApiSchema } from '@netcracker/qubership-apihub-graphapi'
import { toTitleCase } from '../../utils/strings'
import {
  calculateDeprecatedItems,
  GRAPH_API_PROPERTY_COMPONENTS,
  JSON_SCHEMA_PROPERTY_DEPRECATED,
  matchPaths,
  OPEN_API_PROPERTY_PATHS,
  parseRef,
  pathItemToFullPath,
  PREDICATE_ANY_VALUE,
  PREDICATE_UNCLOSED_END,
  resolveOrigins,
} from '@netcracker/qubership-apihub-api-unifier'
import { JsonPath, syncCrawl } from '@netcracker/qubership-apihub-json-crawl'
import { DebugPerformanceContext, syncDebugPerformance } from '../../utils/logs'
import { calculateHash, ObjectHashCache } from '../../utils/hashes'

export const buildGraphQLOperation = (
  operationId: string,
  type: GraphQLSchemaType,
  method: string,
  // TODO: move to BuildOperationContext
  document: VersionGraphQLDocument,
  effectiveDocument: GraphApiSchema,
  refsOnlyDocument: GraphApiSchema,
  notifications: NotificationMessage[],
  config: BuildConfig,
  normalizedSpecFragmentsHashCache: ObjectHashCache,
  debugCtx?: DebugPerformanceContext,
): VersionGraphQLOperation => {
  const { apiKind: documentApiKind, slug: documentSlug, versionInternalDocument } = document
  const singleOperationEffectiveSpec: GraphApiSchema = cropToSingleOperation(effectiveDocument, type, method)

  const deprecatedItems: DeprecateItem[] = syncDebugPerformance('[DeprecatedItems]', () => {
    const foundedDeprecatedItems = calculateDeprecatedItems(singleOperationEffectiveSpec, ORIGINS_SYMBOL)
    const result: DeprecateItem[] = []
    for (const item of foundedDeprecatedItems) {
      const { description, value, deprecatedReason } = item
      const declarationJsonPaths = resolveOrigins(value, JSON_SCHEMA_PROPERTY_DEPRECATED, ORIGINS_SYMBOL)?.map(pathItemToFullPath) ?? []

      const isOperation = isOperationPaths(declarationJsonPaths)
      const [version] = getSplittedVersionKey(config.version)
      const hash = isOperation ? undefined : calculateHash(value, normalizedSpecFragmentsHashCache)

      result.push({
        declarationJsonPaths,
        ...takeIfDefined({ description }),
        ...takeIfDefined({ deprecatedInfo: deprecatedReason }),
        ...takeIf({ [isOperationDeprecated]: true }, isOperation),
        deprecatedInPreviousVersions: config.status === VERSION_STATUS.RELEASE ? [version] : [],
        ...takeIfDefined({ hash: hash }),
      })
    }
    return result
  }, debugCtx)

  return {
    operationId,
    documentId: documentSlug,
    apiType: GRAPHQL_API_TYPE,
    apiKind: documentApiKind || APIHUB_API_COMPATIBILITY_KIND_BWC,
    deprecated: !!singleOperationEffectiveSpec[type]?.[method]?.directives?.deprecated,
    title: toTitleCase(method),
    metadata: {
      type: GRAPHQL_TYPE[type],
      method: method,
    },
    tags: [type],
    data: undefined,  // we do not want to save single-operation specs for GraphQL for performance reasons
    searchScopes: {},
    deprecatedItems,
    models: {},
    apiAudience: API_AUDIENCE_EXTERNAL,
    versionInternalDocumentId: versionInternalDocument.versionDocumentId,
  }
}

const isOperationPaths = (paths: JsonPath[]): boolean => {
  return !!matchPaths(
    paths,
    [[OPEN_API_PROPERTY_PATHS, PREDICATE_ANY_VALUE, PREDICATE_ANY_VALUE]],
  )
}

// todo output of this method disrupts document normalization.
//  origin symbols are not being transferred to the resulting spec.
//  DO NOT pass output of this method to apiDiff
export const cropToSingleOperation = (
  specification: GraphApiSchema,
  type: GraphQLSchemaType,
  method: string,
): GraphApiSchema => {
  const onlyOperationsSpec = removeComponents(specification) as GraphApiSchema
  const operationBody = onlyOperationsSpec[type]?.[method]
  return {
    graphapi: onlyOperationsSpec.graphapi,
    ...takeIfDefined({ components: onlyOperationsSpec.components }),
    [type]: {
      [method]: operationBody,
    },
  }
}

export const calculateSpecRefs = (sourceSpec: unknown, normalizedSpec: unknown, operationOnlySpec: unknown): void => {
  const handledObjects = new Set<unknown>()
  const inlineRefs = new Set<string>()
  syncCrawl(
    normalizedSpec,
    ({ key, value }) => {
      if (typeof key === 'symbol' && key !== INLINE_REFS_FLAG) {
        return { done: true }
      }
      if (handledObjects.has(value)) {
        return { done: true }
      }
      handledObjects.add(value)
      if (key !== INLINE_REFS_FLAG) {
        return { value }
      }
      if (!Array.isArray(value)) {
        return { done: true }
      }
      value.forEach(ref => inlineRefs.add(ref))
    },
  )
  inlineRefs.forEach(ref => {
    const path = parseRef(ref).jsonPath
    const matchResult = matchPaths([path], [
      [GRAPH_API_PROPERTY_COMPONENTS, PREDICATE_ANY_VALUE, PREDICATE_ANY_VALUE, PREDICATE_UNCLOSED_END],
    ])
    if (!matchResult) {
      return
    }
    const component = getKeyValue(sourceSpec, ...matchResult.path)
    if (!component) {
      return
    }
    setValueByPath(operationOnlySpec, matchResult.path, component)
  })
}

/**
 * Creates a GraphQL spec containing only the specified operations with resolved component references.
 *
 * @param sourceDocument The original GraphQL document (used as source for operation data and component values).
 * @param normalizedDocument A normalized/refs-only document (used to detect inline refs that must be copied).
 * @param operationsId Array of operation IDs (as produced by calculateGraphqlOperationId) to include.
 * @throws Error when no operations are provided or when any requested operation is missing in the document.
 */
export const createSingleOperationSpec = (
  sourceDocument: GraphApiSchema,
  normalizedDocument: GraphApiSchema,
  operationsId: string[],
): GraphApiSchema => {
  if (operationsId.length === 0) {
    throw new Error(
      'No operations provided. Pass a non-empty array of GraphQL operation IDs.',
    )
  }

  const operationsIdSet = new Set(operationsId)
  const matchedIds = new Set<string>()
  const resultOperations: Partial<Pick<GraphApiSchema, typeof GRAPHQL_TYPE_KEYS[number]>> = {}

  for (const type of GRAPHQL_TYPE_KEYS) {
    const operationsByType = sourceDocument[type]
    if (!operationsByType) { continue }
    for (const method of Object.keys(operationsByType)) {
      const operationId = calculateGraphqlOperationId(GRAPHQL_TYPE[type], method)
      if (!operationsIdSet.has(operationId)) { continue }
      matchedIds.add(operationId)
      if (!resultOperations[type]) {
        resultOperations[type] = {}
      }
      resultOperations[type]![method] = { ...operationsByType[method] }
    }
  }

  const missingIds = operationsId.filter(id => !matchedIds.has(id))
  if (missingIds.length > 0) {
    throw new Error(
      `Operations not found in document: ${missingIds.join(', ')}`,
    )
  }

  const result: GraphApiSchema = {
    graphapi: sourceDocument.graphapi,
    ...takeIfDefined({ description: sourceDocument.description }),
    ...takeIfDefined({ directives: sourceDocument.directives }),
    ...resultOperations,
    ...takeIfDefined(resultOperations.queries ? { queryTypeName: sourceDocument.queryTypeName } : {}),
    ...takeIfDefined(resultOperations.mutations ? { mutationTypeName: sourceDocument.mutationTypeName } : {}),
    ...takeIfDefined(resultOperations.subscriptions ? { subscriptionTypeName: sourceDocument.subscriptionTypeName } : {}),
  }

  // Build operation-only normalized spec for ref detection
  const normalizedOperationSpec: Partial<GraphApiSchema> = {}
  for (const type of GRAPHQL_TYPE_KEYS) {
    const normalizedByType = normalizedDocument[type]
    if (!normalizedByType) { continue }
    for (const method of Object.keys(normalizedByType)) {
      const operationId = calculateGraphqlOperationId(GRAPHQL_TYPE[type], method)
      if (!operationsIdSet.has(operationId)) { continue }
      if (!normalizedOperationSpec[type]) {
        normalizedOperationSpec[type] = {}
      }
      normalizedOperationSpec[type]![method] = normalizedByType[method]
    }
  }

  // Resolve component references from normalizedDocument into result
  calculateSpecRefs(sourceDocument, normalizedOperationSpec, result)

  return result
}
