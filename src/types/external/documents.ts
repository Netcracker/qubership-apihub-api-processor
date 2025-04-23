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

import { OperationsApiType, PackageId, VersionId } from './types'
import { ResolvedReferenceMap } from './references'
import { FileFormat } from '../internal'

export type VersionDocumentsResolver = (
  apiType: OperationsApiType,
  version: VersionId,
  packageId: PackageId,
  filterByOperationGroup: string,
) => Promise<ResolvedVersionDocuments | null>

export type ResolvedVersionDocuments = {
  documents: ReadonlyArray<ResolvedVersionDocument>
  packages: ResolvedReferenceMap
}

export type ResolvedVersionDocument = {
  fileId: string
  filename: string
  slug: string
  type: string
  format: FileFormat
  title: string
  version?: string
  labels?: Labels
  packageRef?: string
}

export type Labels = string[]

export type GroupDocumentsResolver = (
  apiType: OperationsApiType,
  version: VersionId,
  packageId: PackageId,
  filterByOperationGroup: string,
) => Promise<ResolvedGroupDocuments | null>

export type ResolvedGroupDocuments = {
  documents: ReadonlyArray<ResolvedGroupDocument>
  packages: ResolvedReferenceMap
}

export type ResolvedGroupDocument = {
  fileId: string
  filename: string
  slug: string
  type: string
  format: FileFormat
  title: string
  version?: string
  labels?: Labels
  includedOperationIds?: string[]
  data?: string
  packageRef?: string
  description: string
}
