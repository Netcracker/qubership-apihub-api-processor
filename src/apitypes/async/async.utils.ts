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
import { ASYNC_KNOWN_PROTOCOLS } from './async.consts'

// Re-export shared utilities
export { dump, getCustomTags, resolveApiAudience } from '../../utils/apihubSpecificationExtensions'

/**
 * Extracts protocol from AsyncAPI document servers or channel bindings
 * @param document - AsyncAPI document
 * @param channel - Channel name
 * @returns Protocol string (e.g., 'kafka', 'amqp', 'mqtt') or 'unknown'
 */
export function extractProtocol(document: AsyncAPIV3.AsyncAPIObject, channel: AsyncAPIV3.ChannelObject): AsyncProtocol {
  // TODO why servers is preferred over channel bindings?
  // Try to extract protocol from servers
  const { servers } = document
  if (isObject(servers)) {
    for (const server of Object.values(servers)) {
      if (isServerObject(server)) {
        return server.protocol
      }
    }
  }

  // Try to extract protocol from channel bindings
  if (channel) {
    const bindings = channel?.bindings as AsyncAPIV3.ChannelBindingsObject
    if (isObject(bindings)) {
      const protocol = ASYNC_KNOWN_PROTOCOLS.find(protocol => protocol in bindings)
      if (protocol) {
        return protocol
      }
    }
  }

  // TODO check needed?
  // if (isObject(channel.servers)) {
  //   for (const server of Object.values(channel.servers as AsyncAPIV3.ServerObject[])) {
  //     if (isServerObject(server) && server.protocol) {
  //       return server.protocol
  //     }
  //   }
  // }

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
  return server && typeof server === 'object' && 'protocol' in server
}
