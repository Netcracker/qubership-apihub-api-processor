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
  APIHUB_API_COMPATIBILITY_KIND_BWC,
  APIHUB_API_COMPATIBILITY_KIND_NO_BWC,
} from '../../consts'
import { isObject } from '../../utils'
import { JsonPath } from '@netcracker/qubership-apihub-json-crawl'
import {
  API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE,
  API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE,
  ApiCompatibilityKind,
  ApiCompatibilityScopeFunction,
} from '@netcracker/qubership-apihub-api-diff'
import { getApiKindProperty } from '../document'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/esm/spec-types'

const ROOT_PATH_LENGTH = 0
const ASYNC_OPERATION_PATH_LENGTH = 2 // operations/<operationId>
const ASYNC_CHANNEL_PATH_LENGTH = 2   // channels/<channelId>

/**
 * Creates an ApiCompatibilityScopeFunction for AsyncAPI documents.
 *
 * AsyncAPI has no document-level x-api-kind. The hierarchy is:
 *   Channel (x-api-kind) → Operation (x-api-kind override) → Messages
 *
 * The scope function receives normalized before/after objects where $refs are resolved,
 * so operation.channel is the resolved channel object with all its properties.
 *
 * - operations/<operationId>: operation x-api-kind overrides channel x-api-kind, defaults to bwc
 * - channels/<channelId>: channel's own x-api-kind, defaults to bwc
 */
export const createAsyncApiCompatibilityScopeFunction = (): ApiCompatibilityScopeFunction => {
  return (
    path?: JsonPath,
    beforeJso?: unknown,
    afterJso?: unknown,
  ): ApiCompatibilityKind | undefined => {
    const pathLength = path?.length ?? 0

    // Root level: default to BWC (no document-level x-api-kind in AsyncAPI)
    if (pathLength === ROOT_PATH_LENGTH) {
      return API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE
    }

    const firstSegment = path?.[0]

    // operations/<operationId>: resolve api-kind from operation x-api-kind with channel fallback
    if (firstSegment === 'operations' && pathLength === ASYNC_OPERATION_PATH_LENGTH) {
      // In normalized documents, operation.channel is the resolved channel object
      const beforeChannelKind = getApiKindProperty((beforeJso as AsyncAPIV3.OperationObject | undefined)?.channel)
      const afterChannelKind = getApiKindProperty((afterJso as AsyncAPIV3.OperationObject | undefined)?.channel)

      // Operation's own x-api-kind takes priority, falls back to channel's x-api-kind
      const beforeOperationKind = getApiKindProperty(beforeJso, beforeChannelKind) ?? APIHUB_API_COMPATIBILITY_KIND_BWC
      const afterOperationKind = getApiKindProperty(afterJso, afterChannelKind) ?? APIHUB_API_COMPATIBILITY_KIND_BWC

      const isRemoved = isObject(beforeJso) && !isObject(afterJso)
      if (isRemoved) {
        return beforeOperationKind === APIHUB_API_COMPATIBILITY_KIND_NO_BWC
          ? API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE
          : API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE
      }

      if (beforeOperationKind === APIHUB_API_COMPATIBILITY_KIND_NO_BWC || afterOperationKind === APIHUB_API_COMPATIBILITY_KIND_NO_BWC) {
        return API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE
      }

      return API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE
    }

    // channels/<channelId>: use channel's own x-api-kind
    if (firstSegment === 'channels' && pathLength === ASYNC_CHANNEL_PATH_LENGTH) {
      const beforeChannelKind = getApiKindProperty(beforeJso) ?? APIHUB_API_COMPATIBILITY_KIND_BWC
      const afterChannelKind = getApiKindProperty(afterJso) ?? APIHUB_API_COMPATIBILITY_KIND_BWC

      if (beforeChannelKind === APIHUB_API_COMPATIBILITY_KIND_NO_BWC || afterChannelKind === APIHUB_API_COMPATIBILITY_KIND_NO_BWC) {
        return API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE
      }

      return API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE
    }

    return undefined
  }
}
