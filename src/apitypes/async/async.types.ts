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

import { ApiOperation, VersionDocument } from '../../types'
import { ASYNC_DOCUMENT_TYPE } from './async.consts'
import { CustomTags } from '../../utils/apihubSpecificationExtensions'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/esm/spec-types'

export type AsyncDocumentType = (typeof ASYNC_DOCUMENT_TYPE)[keyof typeof ASYNC_DOCUMENT_TYPE]
export type AsyncOperationActionType = 'send' | 'receive'

/**
 * AsyncAPI 3.0 operation metadata
 */
export interface AsyncOperationMeta {
  action: AsyncOperationActionType  // Operation action
  channel: string                   // Channel name
  protocol: string                  // Protocol (e.g., 'kafka', 'amqp', 'mqtt')
  customTags: CustomTags            // Custom x-* extensions
  messageId: string                 // Message key from the channel's messages map (e.g., 'UserSignedUp')
  asyncOperationId: string          // Operation key from the AsyncAPI operations map (e.g., 'sendUserSignedup')
  /**
   * The channel's `address` - the thing a consumer actually binds to, unlike `channel` above,
   * which is a display title. Used to pair operations across versions when their generated ids
   * differ.
   *
   * Optional because `ChannelObject.address` is `string | null`: a channel may genuinely have
   * none.
   */
  address?: string
  /**
   * api-diff's `payloadIdentity()`: the declaration path of the message's payload schema, e.g.
   * `components/schemas/OrderEvent`. Readable on purpose, so a mis-pairing can be diagnosed from
   * stored metadata alone.
   *
   * **Compare for equality only - the format is not stable.** It is the pairing algorithm's
   * internal anchor. Nothing may parse it; in particular, do not derive a display name from its
   * last segment. If a schema name is ever wanted for display, add a separate field for it.
   *
   * Optional because an inline payload has no stable declaration path to anchor on.
   *
   * Declared `string` rather than api-diff's branded `SemanticIdentity`: the brand is for
   * in-process computation and does not survive storage or a JSON response, so declaring it here
   * would give false confidence and force a widening cast at the ui boundary.
   *
   * Mirrored by `AsyncApiOperationDto` in the ui repository - keep the two in step.
   */
  payloadIdentity?: string
}

/**
 * AsyncAPI document info
 */
export interface AsyncDocumentInfo {
  title: string
  description: string
  version: string
  info?: Partial<AsyncAPIV3.InfoObject>
  externalDocs?: Partial<AsyncAPIV3.ExternalDocumentationObject>
  tags: AsyncAPIV3.TagObject[]
}

/**
 * AsyncAPI operation data (single operation spec)
 */
export interface AsyncOperationData {
  asyncapi: string
  id?: string
  info: AsyncAPIV3.InfoObject
  defaultContentType?: string
  servers?: AsyncAPIV3.ServersObject
  channels?: AsyncAPIV3.ChannelsObject
  operations?: AsyncAPIV3.OperationsObject
  components?: AsyncAPIV3.ComponentsObject
  // Root-level specification extensions (`x-*`) from the source AsyncAPI document
  // are copied onto the spec but are not statically typed here.
}

export type VersionAsyncDocument = VersionDocument<AsyncAPIV3.AsyncAPIObject>
export type VersionAsyncOperation = ApiOperation<AsyncOperationData, AsyncOperationMeta>
