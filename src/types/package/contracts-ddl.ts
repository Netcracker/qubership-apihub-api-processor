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

export type DdlKind = 'table' | 'view'

export interface PackageDdlContract {
  ddlTableId: string
  kind: DdlKind
  schemaName?: string
  name?: string
  searchText?: string
  metadata?: Record<string, unknown>
  documentId?: string
  contentPath: string
  dataHash?: string
}

export interface PackageDdlContractsFile {
  contracts: PackageDdlContract[]
}

export interface PackageDdlComparison {
  ddlTableId: string
  previousDdlTableId: string
  dataHash?: string
  previousDataHash?: string
  changesSummary?: Record<string, number>
  changes?: unknown
  comparisonPath: string
}

export interface PackageDdlComparisonsFile {
  comparisons: PackageDdlComparison[]
}
