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

import { asyncApi } from '@netcracker/qubership-apihub-api-diff'

import { NormalizedOperationId, OperationsMapper, ResolvedOperation } from '../../types'
import { AsyncOperationMeta } from '../../apitypes/async/async.types'
import { OperationsMap, pairByKey } from './compare.utils'

/** Local alias for readability; the identity is api-diff's, brand and all. */
type SemanticIdentity = asyncApi.SemanticIdentity

/**
 * Id equality first, then a semantic pass over whatever it left one-sided.
 *
 * Id equality stays authoritative: it runs first and `pairAsyncApiLeftoversByIdentity` only ever
 * touches entries that ended up with a single side. That ordering is this function's choice, not
 * something the `OperationsMapper` contract imposes.
 */
export const mapAsyncApiOperations: OperationsMapper = (previousByKey, currentByKey) =>
  pairAsyncApiLeftoversByIdentity(pairByKey(previousByKey, currentByKey))

/**
 * Pairs the APIHUB operations that id-equality left one-sided, by what a consumer can observe
 * rather than by the generated ids the operation id is built from.
 *
 * An APIHUB AsyncAPI operation is an `(asyncOperationId, messageId)` tuple, and *both* halves can
 * carry a hash of some description text. Pairing the combined id therefore turns a documentation
 * edit into an operation removed plus an operation added.
 *
 * The pairing is **hierarchical, mirroring api-diff's tree** (plan §11.2): AsyncAPI operations
 * pair first, on `action x address x their messages' payload identities`, and only then do the
 * messages inside an already-paired operation pair on payload identity alone. Flat-sorting the
 * combined id instead would let the two components disagree on an ambiguous group.
 *
 * Operations whose metadata lacks `address` or `payloadIdentity` are skipped, which means exactly
 * one thing: the entity has no stable anchor - an inline payload, or a channel with no address.
 * Every published version is reprocessed by the current api-processor, so absence never means
 * "this version predates the field". Those operations keep plain id-equality behaviour.
 */
const pairAsyncApiLeftoversByIdentity = (operationsMap: OperationsMap): OperationsMap => {
  const previousLeftovers: OperationEntry[] = []
  const currentLeftovers: OperationEntry[] = []

  for (const [normalizedOperationId, { previous, current }] of Object.entries(operationsMap)) {
    if (previous && current) {
      continue
    }
    if (previous) {
      previousLeftovers.push({ normalizedOperationId, operation: previous })
    } else if (current) {
      currentLeftovers.push({ normalizedOperationId, operation: current })
    }
  }
  if (previousLeftovers.length === 0 || currentLeftovers.length === 0) {
    return operationsMap
  }

  const previousGroups = groupByAsyncOperation(previousLeftovers)
  const currentGroups = groupByAsyncOperation(currentLeftovers)

  const { pairs: operationPairs } = asyncApi.pairLeftoversByIdentity(
    identitiesOf(previousGroups, identityOfAsyncOperation),
    identitiesOf(currentGroups, identityOfAsyncOperation),
    asyncApi.compareSemanticTieBreak,
  )

  const paired = { ...operationsMap }
  for (const [previousAsyncOperationId, currentAsyncOperationId] of operationPairs) {
    const previousGroup = previousGroups.get(previousAsyncOperationId)!
    const currentGroup = currentGroups.get(currentAsyncOperationId)!

    const { pairs: messagePairs } = asyncApi.pairLeftoversByIdentity(
      identitiesOf(previousGroup, identityOfMessage),
      identitiesOf(currentGroup, identityOfMessage),
      asyncApi.compareSemanticTieBreak,
    )

    for (const [previousMessageId, currentMessageId] of messagePairs) {
      const previousEntry = previousGroup.get(previousMessageId)!
      const currentEntry = currentGroup.get(currentMessageId)!
      // Emitted under the current id, which is also the key the merged document uses for a mapped
      // node - so `compareDocuments` finds the pair where it already looks.
      delete paired[previousEntry.normalizedOperationId]
      paired[currentEntry.normalizedOperationId] = {
        previous: previousEntry.operation,
        current: currentEntry.operation,
      }
    }
  }
  return paired
}

interface OperationEntry {
  readonly normalizedOperationId: NormalizedOperationId
  readonly operation: ResolvedOperation
}

/** `asyncOperationId -> messageId -> entry`. Both keys are the raw AsyncAPI map keys (§11.2). */
type AsyncOperationGroups = Map<string, Map<string, OperationEntry>>

const metadataOf = (entry: OperationEntry): Partial<AsyncOperationMeta> =>
  (entry.operation.metadata ?? {}) as Partial<AsyncOperationMeta>

const groupByAsyncOperation = (entries: readonly OperationEntry[]): AsyncOperationGroups => {
  const groups: AsyncOperationGroups = new Map()
  for (const entry of entries) {
    const { asyncOperationId, messageId } = metadataOf(entry)
    if (!asyncOperationId || !messageId) {
      continue
    }
    const group = groups.get(asyncOperationId)
    if (group) {
      group.set(messageId, entry)
    } else {
      groups.set(asyncOperationId, new Map([[messageId, entry]]))
    }
  }
  return groups
}

/**
 * All-or-nothing, matching api-diff: one message we cannot characterize makes the whole
 * operation's message set unknown, and pairing on a partial set could match two operations that
 * merely share an address and one message.
 */
const identityOfAsyncOperation = (group: Map<string, OperationEntry>): SemanticIdentity | undefined => {
  const payloads: string[] = []
  let action: string | undefined
  let address: string | undefined
  for (const entry of group.values()) {
    const metadata = metadataOf(entry)
    if (!metadata.action || !metadata.address || !metadata.payloadIdentity) {
      return undefined
    }
    action ??= metadata.action
    address ??= metadata.address
    if (action !== metadata.action || address !== metadata.address) {
      return undefined
    }
    payloads.push(metadata.payloadIdentity)
  }
  if (action === undefined || address === undefined) {
    return undefined
  }
  return asyncApi.formatSemanticIdentity([action, address, ...payloads.sort()])
}

const identityOfMessage = (entry: OperationEntry): SemanticIdentity | undefined => {
  const { payloadIdentity } = metadataOf(entry)
  // The parent operation already fixes the action and the address, exactly as inside one channel
  // or one operation in api-diff.
  return payloadIdentity === undefined ? undefined : asyncApi.formatSemanticIdentity([payloadIdentity])
}

const identitiesOf = <T>(
  source: Map<string, T>,
  identityOf: (value: T) => SemanticIdentity | undefined,
): Map<string, SemanticIdentity> => {
  const identities = new Map<string, SemanticIdentity>()
  for (const [key, value] of source) {
    const identity = identityOf(value)
    if (identity !== undefined) {
      identities.set(key, identity)
    }
  }
  return identities
}
