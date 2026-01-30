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
import { AsyncOperationActionType } from './async.types'

// Re-export shared utilities
export { dump, getCustomTags, resolveApiAudience } from '../../utils/apihubSpecificationExtensions'

/**
 * Extracts protocol from AsyncAPI document servers or channel bindings
 * @param document - AsyncAPI document
 * @param channel - Channel name
 * @returns Protocol string (e.g., 'kafka', 'amqp', 'mqtt') or 'unknown'
 */
export function extractProtocol(document: AsyncAPIV3.AsyncAPIObject, channel: AsyncAPIV3.ChannelObject): string {
  // Try to extract protocol from servers
  const { servers } = document
  if (isObject(servers)) {
    for (const server of Object.values(servers)) {
      if (isServerObject(server)) {
        return String(server.protocol)
      }
    }
  }

  // Try to extract protocol from channel bindings
  if (channel) {
    if (isObject(channel)) {
      // Check for protocol in bindings
      const { bindings } = channel
      if (isObject(bindings)) {
        // Common protocol bindings: kafka, amqp, mqtt, http, ws, etc.
        const knownProtocols = ['kafka', 'amqp', 'mqtt', 'http', 'ws', 'websockets', 'jms', 'nats', 'redis', 'sns', 'sqs']
        for (const protocol of knownProtocols) {
          if (bindings[protocol]) {
            return protocol
          }
        }
      }
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
  return server && typeof server === 'object' && 'protocol' in server
}

