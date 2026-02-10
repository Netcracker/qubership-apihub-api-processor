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
import { isObject } from '../../utils'
import { AsyncOperationActionType, AsyncProtocol } from './async.types'
import { normalize } from '@netcracker/qubership-apihub-api-unifier'
import { ASYNC_SUPPORTED_PROTOCOLS } from './async.consts'
import { APIHUB_API_COMPATIBILITY_KIND_BWC, ApihubApiCompatibilityKind } from '../../consts'
import { JsonPath } from '@netcracker/qubership-apihub-json-crawl'

// Re-export shared utilities
export { dump, getCustomTags, resolveApiAudience } from '../../utils/apihubSpecificationExtensions'

/**
 * Extracts protocol from AsyncAPI document servers or channel bindings
 * @param channel - Channel object to extract protocol from
 * @returns Protocol string (e.g., 'kafka', 'amqp', 'mqtt') or 'unknown'
 */
export function extractProtocol(channel: AsyncAPIV3.ChannelObject): AsyncProtocol {
  if (!isObject(channel.servers)) {
    return 'unknown'
  }
  for (const server of Object.values(channel.servers as AsyncAPIV3.ServerObject[])) {
    if (isServerObject(server) && server.protocol) {
      const { protocol } = server
      return ASYNC_SUPPORTED_PROTOCOLS.includes(protocol) ? protocol as AsyncProtocol : 'unknown'
    }
  }

  return 'unknown'
}

/**
 * Determines the operation action (send/receive) from operation data
 * @param operationData - Operation object
 * @returns 'send' or 'receive'
 */
export function determineOperationAction(operationData: any): AsyncOperationActionType {
  if (operationData && typeof operationData === 'object') {
    const { action } = operationData
    if (action === 'send' || action === 'receive') {
      return action
    }
  }
  // Default to 'send' if not specified
  return 'send'
}

function isServerObject(server: AsyncAPIV3.ServerObject | AsyncAPIV3.ReferenceObject): server is AsyncAPIV3.ServerObject {
  return isObject(server) && 'protocol' in server
}

function isTagObject(item: AsyncAPIV3.TagObject | AsyncAPIV3.ReferenceObject): item is AsyncAPIV3.TagObject {
  return (item as AsyncAPIV3.TagObject).name !== undefined
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

export const extractKeyAfterPrefix = (paths: JsonPath[], prefix: PropertyKey[]): string | undefined => {
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
