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

import type { ApiBuilder, ApiOperation, BuilderContext, BuildResult, VersionDocument } from '../types'
import { createCrossDocumentDuplicateHandler, DuplicateOperationHandler, setReportingDuplicate } from '../utils'
import { ASYNCAPI_API_TYPE, MESSAGE_CATEGORY, MESSAGE_SEVERITY } from '../consts'
import { Claims, collectClaim, listDocuments, reportCollisions } from './duplicate-resolution'
import { NotificationMessage } from '../types/package/notifications'

// Cross-document only: which claimant ends up indexed is `setReportingDuplicate`'s decision, not this one's.
export const createDuplicateOperationHandler = (buildResult: BuildResult): DuplicateOperationHandler =>
  createCrossDocumentDuplicateHandler(
    buildResult.notifications,
    MESSAGE_CATEGORY.DuplicateOperationId,
    // AsyncAPI grades this an `Error`, REST and GraphQL a `Warning`
    ({ apiType }) => (apiType === ASYNCAPI_API_TYPE ? MESSAGE_SEVERITY.Error : MESSAGE_SEVERITY.Warning),
    (existing, duplicate) => `Duplicated operationId '${duplicate.operationId}' found in different documents: ` +
      `'${existing.documentId}' and '${duplicate.documentId}'`,
  )

/** All a collision needs to know about a claimant: who derived the id, and by which api type. */
export interface OperationClaim {
  documentId: string
  apiType: string
}

/**
 * Grade every operationId two or more documents derived, reading `operationClaims` off the documents.
 *
 * Used by the editor's incremental rebuild, which has no built content of its own to collect from. A
 * publication collects the same claims from what it just built and calls `reportOperationCollisions`; both
 * grade over the whole claimant set, so both reach the same verdict for the same documents.
 */
export function reportOperationCollisionsOf(
  documents: Iterable<VersionDocument>,
  notifications: NotificationMessage[],
): void {
  const claims: Claims<OperationClaim> = new Map()
  for (const document of documents) {
    for (const { operationId, apiType } of document.operationClaims ?? []) {
      collectClaim(claims, operationId, { documentId: document.slug, apiType })
    }
  }
  reportOperationCollisions(claims, notifications)
}

/** Cross-document operationId collisions, over the whole claimant set — see `reportCollisions`. */
export function reportOperationCollisions(
  claims: Claims<OperationClaim>,
  notifications: NotificationMessage[],
): void {
  reportCollisions(
    claims,
    notifications,
    MESSAGE_CATEGORY.DuplicateOperationId,
    // AsyncAPI grades this an `Error`, REST and GraphQL a `Warning`
    ({ apiType }) => (apiType === ASYNCAPI_API_TYPE ? MESSAGE_SEVERITY.Error : MESSAGE_SEVERITY.Warning),
    (operationId, documentIds) =>
      `Duplicated operationId '${operationId}' found in different documents: ${listDocuments(documentIds)}`,
  )
}

export async function buildDocumentOperations(
  document: VersionDocument,
  builder: ApiBuilder,
  ctx: BuilderContext,
): Promise<ApiOperation[]> {
  return builder.buildOperations ? await builder.buildOperations(document, ctx) : []
}

/**
 * Claim the document's operations in the build's index.
 *
 * Collisions are already reported by `reportIdCollisions`, which runs first over the whole claimant set — no
 * handler is passed here, so nothing is reported twice.
 */
export function indexOperations(
  document: VersionDocument,
  operations: ApiOperation[],
  buildResult: BuildResult,
  onDuplicate?: DuplicateOperationHandler,
): void {
  // everything this document built; `reconcileOwnedIds` prunes what another document ends up owning
  document.operationIds = operations.map(({ operationId }) => operationId)
  // kept whole, because a collision is graded over every claimant and the loser's own entry does not survive
  document.operationClaims = operations.map(({ operationId, apiType }) => ({ operationId, apiType }))
  for (const operation of operations) {
    setReportingDuplicate(buildResult.operations, operation.operationId, operation, onDuplicate)
  }
}

/** Build and claim in one step, for the editor's incremental rebuild. */
export async function processOperationDocument(
  document: VersionDocument,
  builder: ApiBuilder,
  ctx: BuilderContext,
  buildResult: BuildResult,
  onDuplicate?: DuplicateOperationHandler,
): Promise<void> {
  if (!builder.buildOperations) { return }
  indexOperations(document, await buildDocumentOperations(document, builder, ctx), buildResult, onDuplicate)
}
