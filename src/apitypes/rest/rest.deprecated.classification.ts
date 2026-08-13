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
  breaking,
  DiffAction,
  extractOperationBasePath,
  type DiffClassificationContext,
  type DiffClassificationRule,
  type DiffType,
  type TraversalDimension,
  risky,
} from '@netcracker/qubership-apihub-api-diff'
import {
  JSON_SCHEMA_PROPERTY_DEPRECATED,
  OPEN_API_PROPERTY_PATHS,
} from '@netcracker/qubership-apihub-api-unifier'
import { JsonPath } from '@netcracker/qubership-apihub-json-crawl'
import { OpenAPIV3 } from 'openapi-types'

import {
  CompareOperationsPairContext,
  DeprecateItem,
  ResolvedDeprecatedOperation,
  ResolvedVersionDocument,
} from '../../types'
import { DEFAULT_BATCH_SIZE, MESSAGE_SEVERITY, REST_API_TYPE } from '../../consts'
import {
  areDeprecatedOriginsNotEmpty,
  containsDeprecatedElement,
  deprecatedDeclarationPaths,
  calculateNormalizedRestOperationId,
  executeInBatches,
  isObject,
  isValidHttpMethod,
} from '../../utils'
import { calculateHash } from '../../utils/hashes'
import { declarationPathsKey } from '../../utils/path'
import { OperationsMap } from '../../components'
import { DIMENSION_DEPRECATION } from '../../components/compare/traversal.dimensions'

/** The notice must have been carried by more than one released version: a single release is not enough. */
const SUFFICIENT_DEPRECATION_HISTORY = 1

const OPERATION_PATH_LENGTH = 3 // paths/<path>/<method>

/**
 * The APIHUB rule for removal of long-deprecated elements: the dimension says which traversals may
 * disagree, the rule says what each decides. Both empty when nothing was announced long enough.
 */
type DeprecatedRemovalRules = {
  dimensions: readonly TraversalDimension[]
  rules: readonly DiffClassificationRule[]
}

const NOTHING_TO_DOWNGRADE: DeprecatedRemovalRules = { dimensions: [], rules: [] }

/** Value of the deprecation dimension: the group of operations allowed to disagree about a removal. */
type DeprecationPartition = string

/** Hash plus declaration paths, the same pair that identifies a stored `DeprecateItem`. */
type DeprecatedElementId = string

type OperationKey = string

/** Everything announced long enough to be removed, as seen from one partition. */
type SeasonedDeprecations = ReadonlySet<DeprecatedElementId>

/** What the traversal asks about an operation, settled up front. One lookup answers both. */
type PreparedOperation = {
  isOperationSeasoned: boolean
  partition: DeprecationPartition | undefined
}

/** What was announced long enough for one operation. */
type OperationDeprecations = {
  isOperationSeasoned: boolean
  /** Every seasoned element of the operation, matched against removals reached from it. */
  elements: SeasonedDeprecations
  /** Only those another operation could reach as well, which is what the partition keys on. */
  shareableElements: SeasonedDeprecations
}

/**
 * Builds the deprecated-removal rules for one document pair.
 * Two operations sharing a schema can disagree about the same removed element, since whether a removal
 * breaks consumers depends on how long they were warned. api-diff yields one difference per change, not
 * per route to it, so partitions are what keep the two verdicts apart. Deciding inside apiDiff, instead
 * of rewriting types afterwards, makes the result independent of the order operations are visited.
 * History comes from the previous version, so it is fetched up front and both returned functions are
 * synchronous, as api-diff requires.
 */
export async function createDeprecatedRemovalRules(
  operationsMap: OperationsMap,
  previousDocument: ResolvedVersionDocument | undefined,
  previousDocumentData: OpenAPIV3.Document | undefined,
  ctx: CompareOperationsPairContext,
): Promise<DeprecatedRemovalRules> {
  // No deprecation notice in the document means nothing here can be downgraded, so skip the lookup
  if (!containsDeprecatedElement(previousDocumentData)) {
    return NOTHING_TO_DOWNGRADE
  }

  const previousOperations = await resolvePreviousDeprecations(operationsMap, previousDocument, ctx)
  const seasonedByOperationId = collectSeasonedDeprecations(previousOperations ?? [])
  if (!seasonedByOperationId.size) {
    return NOTHING_TO_DOWNGRADE
  }

  const { preparedByOperationId, seasonedByPartition } = assignPartitions(seasonedByOperationId)
  const preparedOf = createPreparedOperationLookup(operationsMap, previousDocumentData?.servers, preparedByOperationId)
  const reportBrokenOrigins = createBrokenOriginsReporter(ctx)

  return {
    dimensions: [{
      name: DIMENSION_DEPRECATION,
      valueAt: (path, beforeJso) => (
        path && isOperationPath(path) ? preparedOf(path[1], path[2], beforeJso)?.partition : undefined
      ),
    }],

    rules: [(context) => {
      if (context.type !== breaking || context.action !== DiffAction.remove) {
        return undefined
      }

      const operationVerdict = classifyOperationRemoval(context, preparedOf)
      if (operationVerdict) {
        return operationVerdict
      }

      const partition = context.dimensions[DIMENSION_DEPRECATION]
      const seasoned = partition ? seasonedByPartition.get(partition) : undefined
      if (!seasoned?.size) {
        return undefined
      }

      return classifyElementRemoval(context.beforeValue, seasoned, ctx, reportBrokenOrigins)
    }],
  }
}

/**
 * Looks an operation up the way the comparison spells it: by path, method and the operation object.
 * Resolved on demand rather than by walking the previous document up front, which keeps operations
 * declared through a path-item `$ref` visible. The comparison reports normalized paths, where the
 * reference is already resolved, while the raw document shows only the `$ref`.
 */
function createPreparedOperationLookup(
  operationsMap: OperationsMap,
  previousDocumentServers: OpenAPIV3.ServerObject[] | undefined,
  preparedByOperationId: Map<string, PreparedOperation>,
): PreparedOperationLookup {
  const resolved = new Map<OperationKey, PreparedOperation | undefined>()

  return (path, method, operation) => {
    // Memoized on path and method alone: every caller passes the normalized operation object, where path
    // item servers are already lifted in, so they all derive the same base path
    const key = operationKey(path, method)
    if (resolved.has(key)) {
      return resolved.get(key)
    }

    const basePath = extractOperationBasePath((operation as OpenAPIV3.OperationObject | undefined)?.servers || previousDocumentServers || [])
    const previousOperationId = operationsMap[calculateNormalizedRestOperationId(basePath, String(path), String(method))]?.previous?.operationId
    const prepared = previousOperationId ? preparedByOperationId.get(previousOperationId) : undefined

    resolved.set(key, prepared)
    return prepared
  }
}

type PreparedOperationLookup = (
  path: PropertyKey | undefined,
  method: PropertyKey | undefined,
  operation: unknown,
) => PreparedOperation | undefined

/**
 * Groups the operations into partitions and settles, per operation, everything the comparison will ask.
 * Operations need separate partitions only where they can disagree, which means only about an element
 * another operation can reach (see `isPrivateToOperation`). Keying on those alone keeps the common
 * cleanup pattern, every operation retiring a field of its own, in one partition.
 * A partition answers with the union of its operations' seasoned elements, which is sound because its
 * shareable elements are identical by construction and the private ones reach a single operation.
 */
function assignPartitions(seasonedByOperationId: Map<string, OperationDeprecations>): {
  preparedByOperationId: Map<string, PreparedOperation>
  seasonedByPartition: Map<DeprecationPartition, SeasonedDeprecations>
} {
  const partitionBySignature = new Map<string, DeprecationPartition>()
  const seasonedByPartition = new Map<DeprecationPartition, Set<DeprecatedElementId>>()
  const preparedByOperationId = new Map<string, PreparedOperation>()

  for (const [operationId, { isOperationSeasoned, elements, shareableElements }] of seasonedByOperationId) {
    // Nothing matchable, so nothing to disagree about: no partition, and the operation goes on sharing
    // difference instances. Kept only because `classifyOperationRemoval` still reads `isOperationSeasoned`
    if (!elements.size) {
      preparedByOperationId.set(operationId, { isOperationSeasoned, partition: undefined })
      continue
    }

    const signature = [...shareableElements].sort().join('\n')
    const partition = partitionBySignature.get(signature) ?? `deprecated-${partitionBySignature.size}`
    const pooled = seasonedByPartition.get(partition) ?? new Set<DeprecatedElementId>()

    partitionBySignature.set(signature, partition)
    seasonedByPartition.set(partition, pooled)
    elements.forEach(element => pooled.add(element))
    preparedByOperationId.set(operationId, { isOperationSeasoned, partition })
  }

  return { preparedByOperationId, seasonedByPartition }
}

/**
 * Declared inside the operation object itself, and therefore reachable from no other operation.
 * Being outside `components` is not enough to conclude that. A parameter declared on the path item is
 * lifted into every method during normalization while keeping its `paths/<path>/parameters/<n>` origin,
 * so sibling methods reach it and may hold different histories for it. Anything not under
 * `paths/<path>/<method>` counts as shareable, which costs a partition but never a wrong verdict.
 */
function isPrivateToOperation({ declarationJsonPaths }: DeprecateItem): boolean {
  return declarationJsonPaths.length > 0 &&
    declarationJsonPaths.every(path => path.length > OPERATION_PATH_LENGTH && isOperationPath(path.slice(0, OPERATION_PATH_LENGTH)))
}

/**
 * `operationsMap` covers the whole version, so the request is narrowed to the previous document's
 * operations and batched. Asking for the whole version on every document pair would re-fetch the same
 * data per pair and build a request too large to send. Narrowing also keeps the match honest: two
 * documents can declare the same component path with the same content, and a neighbour's history must
 * not decide this document's verdict.
 */
async function resolvePreviousDeprecations(
  operationsMap: OperationsMap,
  previousDocument: ResolvedVersionDocument | undefined,
  ctx: CompareOperationsPairContext,
): Promise<ResolvedDeprecatedOperation[] | undefined> {
  if (!ctx.previousVersion || !ctx.previousPackageId || !previousDocument) {
    return undefined
  }

  const previousOperationIds = Object.values(operationsMap)
    .map(({ previous }) => previous)
    .filter(operation => operation?.documentId === previousDocument.slug)
    .map(operation => operation!.operationId)

  if (!previousOperationIds.length) {
    return undefined
  }

  const operations: ResolvedDeprecatedOperation[] = []
  await executeInBatches(previousOperationIds, async (batch) => {
    const resolved = await ctx.versionDeprecatedResolver(REST_API_TYPE, ctx.previousVersion, ctx.previousPackageId, batch)
    operations.push(...resolved?.operations ?? [])
  }, DEFAULT_BATCH_SIZE)

  return operations
}

/** Keeps only what has been announced long enough to be removed, per operation of the previous version. */
function collectSeasonedDeprecations(operations: ResolvedDeprecatedOperation[]): Map<string, OperationDeprecations> {
  const seasonedByOperationId = new Map<string, OperationDeprecations>()

  for (const operation of operations) {
    const isOperationSeasoned = (operation.deprecatedInPreviousVersions?.length ?? 0) > SUFFICIENT_DEPRECATION_HISTORY
    const seasonedItems = (operation.deprecatedItems ?? []).filter(item =>
      // An item for the deprecation of the operation itself carries no hash and could never match a removed
      // element; `isOperationSeasoned` answers that case, and keeping it here would cost a partition
      item.hash !== undefined &&
      (item.deprecatedInPreviousVersions?.length ?? 0) > SUFFICIENT_DEPRECATION_HISTORY,
    )
    const elements: SeasonedDeprecations = new Set(seasonedItems.map(deprecatedItemId))
    const shareableElements: SeasonedDeprecations = new Set(
      seasonedItems.filter(item => !isPrivateToOperation(item)).map(deprecatedItemId),
    )

    if (isOperationSeasoned || elements.size) {
      seasonedByOperationId.set(operation.operationId, { isOperationSeasoned, elements, shareableElements })
    }
  }

  return seasonedByOperationId
}

/**
 * Recognized by its own declaration path rather than through the partition, because the difference is
 * born while the parent path item is traversed, where the operation's partition is not in effect yet.
 * Known gap, shared with `isPrivateToOperation`: a path item reused through `$ref` gives both operations
 * the same origins, so removing either inherits the other's seasoning.
 */
function classifyOperationRemoval(
  { beforeDeclarationPaths, beforeValue }: DiffClassificationContext,
  preparedOf: PreparedOperationLookup,
): DiffType | undefined {
  const isSeasoned = beforeDeclarationPaths.some(path =>
    isOperationPath(path) && preparedOf(path[1], path[2], beforeValue)?.isOperationSeasoned,
  )
  return isSeasoned ? risky : undefined
}

/** Addresses an operation object itself, rather than something inside or around one. */
function isOperationPath(path: JsonPath): boolean {
  return path.length === OPERATION_PATH_LENGTH &&
    path[0] === OPEN_API_PROPERTY_PATHS &&
    isValidHttpMethod(String(path[2]))
}

/** The removed value speaks for itself: it carries the deprecation notice and the origins to identify it. */
function classifyElementRemoval(
  removedValue: unknown,
  seasoned: SeasonedDeprecations,
  ctx: CompareOperationsPairContext,
  reportBrokenOrigins: (element: object) => void,
): DiffType | undefined {
  if (!isObject(removedValue) || !removedValue[JSON_SCHEMA_PROPERTY_DEPRECATED]) {
    return undefined
  }

  // Deprecated but with no usable origins, so its history cannot be looked up and the removal stays
  // breaking. Report it rather than let corrupt metadata pass as "not deprecated long enough"
  if (!areDeprecatedOriginsNotEmpty(removedValue)) {
    reportBrokenOrigins(removedValue)
    return undefined
  }

  return seasoned.has(deprecatedElementId(removedValue, ctx)) ? risky : undefined
}

/**
 * Reports a broken deprecated element once, however many differences it produces. Keyed on the element,
 * which api-diff hands out as one shared object across the partitions reaching it, and scoped to the
 * document pair so that a later build in the same process still reports its own.
 */
function createBrokenOriginsReporter(ctx: CompareOperationsPairContext): (element: object) => void {
  const reported = new WeakSet<object>()
  return (element) => {
    if (reported.has(element)) {
      return
    }
    reported.add(element)
    ctx.notifications.push({
      severity: MESSAGE_SEVERITY.Error,
      message: '[Risky validation] Something wrong with origins',
    })
  }
}

function operationKey(path: PropertyKey | undefined, method: PropertyKey | undefined): OperationKey {
  return `${String(path)}-${String(method).toLowerCase()}`
}

function deprecatedItemId(item: DeprecateItem): DeprecatedElementId {
  return elementId(item.hash ?? '', item.declarationJsonPaths)
}

function deprecatedElementId(deprecatedValue: Record<PropertyKey, unknown>, ctx: CompareOperationsPairContext): DeprecatedElementId {
  return elementId(calculateHash(deprecatedValue, ctx.normalizedSpecFragmentsHashCache), deprecatedDeclarationPaths(deprecatedValue))
}

function elementId(hash: string, declarationPaths: JsonPath[]): DeprecatedElementId {
  return `${hash}-${declarationPathsKey(declarationPaths)}`
}
