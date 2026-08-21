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

import type { ApiBuilder, BuilderContext, BuildResult, VersionDocument } from '../types'
import { createCrossDocumentDuplicateHandler, DuplicateOperationHandler, setReportingDuplicate } from '../utils'
import { ASYNCAPI_API_TYPE, MESSAGE_CATEGORY, MESSAGE_SEVERITY } from '../consts'

// Which entity ends up indexed is decided by `setReportingDuplicate`, never here.
//
// The intra-document collision this handler skips belongs to the api type that can have one:
// `rest-duplicate-operation` and `async-duplicate-operation`. GraphQL needs neither — its operation keys are
// object keys, unique within a type, and slugify folds no two valid GraphQL names together.
export const createDuplicateOperationHandler = (buildResult: BuildResult): DuplicateOperationHandler =>
  createCrossDocumentDuplicateHandler(
    buildResult.notifications,
    MESSAGE_CATEGORY.DuplicateOperationId,
    // AsyncAPI kept its Error: this pair used to abort the build, so no published release carries it and
    // there is no population to protect. REST and GraphQL have carried the message for a long time, and
    // blocking those releases retroactively is what the deferral avoids — they tighten once clean.
    ({ apiType }) => (apiType === ASYNCAPI_API_TYPE ? MESSAGE_SEVERITY.Error : MESSAGE_SEVERITY.Warning),
    (existing, duplicate) => `Duplicated operationId '${duplicate.operationId}' found in different documents: ` +
      `'${existing.documentId}' and '${duplicate.documentId}'`,
  )

export async function processOperationDocument(
  document: VersionDocument,
  builder: ApiBuilder,
  ctx: BuilderContext,
  buildResult: BuildResult,
  onDuplicate?: DuplicateOperationHandler,
): Promise<void> {
  if (!builder.buildOperations) { return }
  const operations = await builder.buildOperations(document, ctx)
  // everything this document built; `reconcileOwnedIds` prunes what another document ends up owning
  document.operationIds = operations.map(({ operationId }) => operationId)
  for (const operation of operations) {
    setReportingDuplicate(buildResult.operations, operation.operationId, operation, onDuplicate)
  }
}
