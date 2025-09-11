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

import { OpenAPIV3 } from 'openapi-types'

import type { ApiOperation, NotificationMessage, VersionDocument } from '../../types'
import { REST_DOCUMENT_TYPE, REST_KIND_KEY, REST_SCOPES } from './rest.consts'
import { NormalizedPath } from '../../utils'

export type RestScopeType = keyof typeof REST_SCOPES
export type RestDocumentType = (typeof REST_DOCUMENT_TYPE)[keyof typeof REST_DOCUMENT_TYPE]
export type CustomTags = Record<string, unknown>

export interface RestOperationMeta {
  path: NormalizedPath                    // `/packages/*/version/*`
  originalPath: string                    // `/packages/{packageId}/version/{version}`
  method: OpenAPIV3.HttpMethods           // `get` | `post` | ...
  tags?: string[]                         // operations tags
  customTags?: CustomTags
}

export interface RestDocumentInfo {
  title: string
  description: string
  version: string
  info?: Partial<OpenAPIV3.InfoObject>
  externalDocs?: Partial<OpenAPIV3.ExternalDocumentationObject>
  tags: OpenAPIV3.TagObject[]
}

export type VersionRestDocument = VersionDocument<OpenAPIV3.Document>
export type VersionRestOperation = ApiOperation<RestOperationData, RestOperationMeta>

export interface RestOperationData {
  openapi: string
  servers?: OpenAPIV3.ServerObject[]
  paths: OpenAPIV3.PathsObject
  components?: OpenAPIV3.ComponentsObject
  security?: OpenAPIV3.SecurityRequirementObject[]
}

export interface RestRefCache {
  scopes: Record<RestScopeType, string>
  refs: string[]
  data: any
}

export interface RestOperationContext {
  operationId: string
  scopes: Record<RestScopeType, string>
  operationData: RestOperationData
  document: VersionRestDocument
  refsCache: Record<string, RestRefCache>
  notifications: NotificationMessage[]
}

export interface OperationExtension {
  [REST_KIND_KEY]?: string
}

// export type Merged = {
//   openapi: string;
//   info: InfoObject;
//   servers?: ServerObject[];
//   paths: PathsObject<T>;
//   components?: ComponentsObject;
//   security?: SecurityRequirementObject[];
//   tags?: TagObject[];
//   externalDocs?: ExternalDocumentationObject;
//   'x-express-openapi-additional-middleware'?: (((request: any, response: any, next: any) => Promise<void>) | ((request: any, response: any, next: any) => void))[];
//   'x-express-openapi-validation-strict'?: boolean;
// }
