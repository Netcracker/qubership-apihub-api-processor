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

import { buildAsyncApiOperation } from './async.operation'
import { OperationsBuilder } from '../../types'
import {
  calculateRestOperationId,
  createBundlingErrorHandler,
  createSerializedInternalDocument,
  isNotEmpty,
  removeComponents,
} from '../../utils'
import type * as TYPE from './async.types'
import { AsyncOperationActionType } from './async.types'
import { INLINE_REFS_FLAG } from '../../consts'
import { asyncFunction } from '../../utils/async'
import { logLongBuild, syncDebugPerformance } from '../../utils/logs'
import { normalize, RefErrorType } from '@netcracker/qubership-apihub-api-unifier'
import { ASYNC_EFFECTIVE_NORMALIZE_OPTIONS } from './async.consts'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/esm/spec-types'

type OperationInfo = { channel: string; action: string }
type DuplicateEntry = { operationId: string; operations: OperationInfo[] }

export const buildAsyncApiOperations: OperationsBuilder<AsyncAPIV3.AsyncAPIObject> = async (document, ctx, debugCtx) => {
  const documentWithoutComponents = removeComponents(document.data)
  const bundlingErrorHandler = createBundlingErrorHandler(ctx, document.fileId)

  const { notifications, normalizedSpecFragmentsHashCache, config } = ctx
  const { effectiveDocument, refsOnlyDocument } = syncDebugPerformance('[NormalizeDocument]', () => {
      const effectiveDocument = normalize(
        documentWithoutComponents,
        {
          ...ASYNC_EFFECTIVE_NORMALIZE_OPTIONS,
          source: document.data,
          onRefResolveError: (message: string, _path: PropertyKey[], _ref: string, errorType: RefErrorType) =>
            bundlingErrorHandler([{ message, errorType }]),
        },
      ) as AsyncAPIV3.AsyncAPIObject
      const refsOnlyDocument = normalize(
        documentWithoutComponents,
        {
          mergeAllOf: false,
          inlineRefsFlag: INLINE_REFS_FLAG,
          source: document.data,
        },
      ) as AsyncAPIV3.AsyncAPIObject
      return { effectiveDocument, refsOnlyDocument }
    },
    debugCtx,
  )

  const { operations: operationsObj } = effectiveDocument

  const operations: TYPE.VersionAsyncOperation[] = []
  if (!operationsObj || typeof operationsObj !== 'object') {
    return []
  }

  const operationIdMap = new Map<string, OperationInfo[]>()

  // Iterate through all operations in AsyncAPI 3.0 document
  for (const [operationKey, operationData] of Object.entries(operationsObj)) {
    if (!operationData || typeof operationData !== 'object') {
      continue
    }
    const operationObject = operationData as AsyncAPIV3.OperationObject
    await asyncFunction(async () => {
      const action = operationObject.action as AsyncOperationActionType
      const channel = operationObject.channel as AsyncAPIV3.ChannelObject
      const servers = channel.servers as AsyncAPIV3.ServerObject[]

      if (!action || !channel) {
        return
      }

      const basePath = extractAsyncOperationBasePath(servers)

      // TODO how to calculate operationId in AsyncAPI?
      const operationId = calculateRestOperationId(basePath, operationKey, action)

      const trackedOperations = operationIdMap.get(operationId) ?? []
      // TODO review
      trackedOperations.push({ channel: operationKey, action })
      operationIdMap.set(operationId, trackedOperations)

      syncDebugPerformance('[Operation]', (innerDebugCtx) =>
        logLongBuild(() => {
            const operation = buildAsyncApiOperation(
              operationId,
              operationKey,
              action,
              channel,
              document,
              effectiveDocument,
              refsOnlyDocument,
              notifications,
              config,
              normalizedSpecFragmentsHashCache,
              innerDebugCtx,
            )
            operations.push(operation)
          },
          `${config.packageId}/${config.version} ${operationId}`,
        ), debugCtx, [operationId])
    })
  }

  const duplicates = findDuplicates(operationIdMap)
  if (isNotEmpty(duplicates)) {
    throw createDuplicatesError(document.fileId, duplicates)
  }

  if (operations.length) {
    createSerializedInternalDocument(document, effectiveDocument, ASYNC_EFFECTIVE_NORMALIZE_OPTIONS)
  }

  return operations
}

function findDuplicates(operationIdMap: Map<string, OperationInfo[]>): DuplicateEntry[] {
  return Array.from(operationIdMap.entries())
    .filter(([, operations]) => operations.length > 1)
    .map(([operationId, operations]) => ({ operationId, operations }))
}

function createDuplicatesError(fileId: string, duplicates: DuplicateEntry[]): Error {
  const duplicatesList = duplicates
    .map(({ operationId, operations }) => {
      const operationsList = operations
        .map((operation: OperationInfo) => `${operation.action.toUpperCase()} ${operation.channel}`)
        .join(', ')
      return `- operationId '${operationId}': Found ${operations.length} operations: ${operationsList}`
    })
    .join('\n')
  return new Error(`Duplicated operationIds found within document '${fileId}':\n${duplicatesList}`)
}

//TODO move to diff utils
export const extractAsyncOperationBasePath = (servers?: AsyncAPIV3.ServerObject[]): string => {
  if (!Array.isArray(servers) || !servers.length) { return '' }

  try {
    const [firstServer] = servers
    let serverUrl = firstServer.host + (firstServer.protocol ? `:${firstServer.protocol}` : '')
    if (!serverUrl) {
      return ''
    }

    const { variables = {} } = firstServer as AsyncAPIV3.ServerObject

    for (const param of Object.keys(variables)) {
      const serverVariableObject = (variables as Record<string, AsyncAPIV3.ServerVariableObject>)[param] as AsyncAPIV3.ServerVariableObject
      const serverVariableDefault = serverVariableObject?.default
      if (serverVariableDefault) {
        serverUrl = serverUrl.replace(new RegExp(`{${param}}`, 'g'), serverVariableDefault)
      }
    }

    const { pathname } = new URL(serverUrl, 'https://localhost')
    return pathname.slice(-1) === '/' ? pathname.slice(0, -1) : pathname
  } catch (error) {
    return ''
  }
}
