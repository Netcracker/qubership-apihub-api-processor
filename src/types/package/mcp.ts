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

export const MCP_KIND = {
  INIT: 'init',
  TOOL: 'tool',
  PROMPT: 'prompt',
  RESOURCE: 'resource',
} as const

export type McpKind = typeof MCP_KIND[keyof typeof MCP_KIND]

export interface McpEntitySearch {
  useEntityDataAsSearchText: boolean
}

export interface PackageMcpEntity {
  mcpEntityId: string
  kind: McpKind
  title: string
  description: string
  mcpEndpoint: string
  search: McpEntitySearch
  documentId: string
}

export interface PackageMcpFile {
  inits: PackageMcpEntity[]
  tools: PackageMcpEntity[]
  resources: PackageMcpEntity[]
  prompts: PackageMcpEntity[]
}

/** An MCP entity (index metadata) paired with its raw payload — the result of building MCP contracts. */
export interface McpEntityWithData {
  entity: PackageMcpEntity
  entityData: unknown
}
