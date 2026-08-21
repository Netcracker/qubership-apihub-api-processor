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

import { BuildConfig, BuilderStrategy, BuildResult, BuildTypeContexts, VersionCache, VersionDocument } from '../types'
import { compareVersions } from '../components'
import { applyBuilderVersionInfo } from '../validators'
import { getOperationsList, reconcileOwnedIds, replaceInPlace } from '../utils'
import { buildFiles } from '../components/files'
import { createDuplicateOperationHandler, processOperationDocument } from '../components/operations'
import {
  createDuplicateMcpEntityHandler,
  processMcpDocument,
  validateMcpCapabilities,
  validateMcpInitRequired,
  validateMcpProtocolVersion,
} from '../components/mcp'
import { createDuplicateDdlEntityHandler, processDdlDocument } from '../components/ddl'
import { ParsedDdlData, validateDdlDocument } from '../apitypes/ddl'
import { calculateHistoryForDeprecatedItems } from '../components/deprecated'
import { assertReleaseIsPublishable, comparisonPhaseNotifications } from '../components/release-gate'
import { DDL_CONTRACT_TYPE, MCP_CONTRACT_TYPE, MESSAGE_CATEGORY, MESSAGE_SEVERITY, REST_API_TYPE } from '../consts'
import { MessageCategory, NotificationMessage } from '../types/package/notifications'

const categoryOfDocumentProcessing = (apiType: string): MessageCategory => {
  switch (apiType) {
    case MCP_CONTRACT_TYPE: return MESSAGE_CATEGORY.McpEntityBuild
    case DDL_CONTRACT_TYPE: return MESSAGE_CATEGORY.DdlEntityBuild
    default: return MESSAGE_CATEGORY.BuildOperations
  }
}

export class BuildStrategy implements BuilderStrategy {
  async execute(config: BuildConfig, buildResult: BuildResult, contexts: BuildTypeContexts): Promise<BuildResult> {
    const {
      previousVersionPackageId,
      packageId,
      version,
      previousVersion,
      files,
      refs,
    } = config

    const { builderContext, compareContext } = contexts
    const builderContextObject = builderContext(config)
    const compareContextObject = compareContext(config)

    // the pair's array: a baseline that does not resolve builds no comparison to own the failure
    const rootNotifications: NotificationMessage[] = []

    let previousVersionCache: VersionCache | null = null
    if (previousVersion) {
      previousVersionCache = await compareContextObject
        .forPair(rootNotifications)
        .versionResolver(previousVersion, previousVersionPackageId || packageId)
    }

    if (!files?.length && !refs?.length) {
      throw new Error('Incorrect config: No files and refs')
    }

    if (files?.length) {
      const buildFilesResult = await buildFiles(files, builderContextObject)

      const handleDuplicateOperation = createDuplicateOperationHandler(buildResult)
      const handleDuplicateMcp = createDuplicateMcpEntityHandler(buildResult.notifications)
      const handleDuplicateDdl = createDuplicateDdlEntityHandler(buildResult.notifications)

      for (const { file, document, builder } of buildFilesResult) {
        buildResult.documents.set(document.fileId, document)
        if (!builder || document.publish === false) { continue }

        // Per document, so one failure costs its own operations and nothing else: the document stays
        // published, every later document is still processed, and the reason is recorded against it
        try {
          if (builder.apiType === MCP_CONTRACT_TYPE) {
            processMcpDocument(file, document, builder, buildResult, handleDuplicateMcp)
          } else if (builder.apiType === DDL_CONTRACT_TYPE) {
            // report the parse issues before indexing: an incomplete Realm must not ship in a release
            validateDdlDocument(document as VersionDocument<ParsedDdlData>, buildResult.notifications)
            processDdlDocument(file, document, builder, buildResult, handleDuplicateDdl)
          } else {
            await processOperationDocument(document, builder, builderContextObject, buildResult, handleDuplicateOperation)
          }
        } catch (error) {
          buildResult.notifications.push({
            category: categoryOfDocumentProcessing(builder.apiType),
            severity: MESSAGE_SEVERITY.Error,
            message: error instanceof Error ? error.message : `Cannot process document '${document.slug}'`,
            documentId: document.slug,
          })
        }
      }

      // ownership is final only now: prune the ids another document won before anything reads them
      reconcileOwnedIds(buildResult.documents.values(), buildResult.operations, buildResult.mcpEntities)

      // whole-set cross-check: needs all entities collected first (init and its tools/resources/prompts
      // may live in different files), mirroring how calculateHistoryForDeprecatedItems runs after the loop
      validateMcpInitRequired(buildResult.mcpEntities, buildResult.notifications)
      validateMcpProtocolVersion(buildResult.documents, buildResult.notifications)
      validateMcpCapabilities(buildResult.mcpEntities, buildResult.documents, buildResult.notifications)

      // fail fast: a release already doomed by its own documents should not spend time on a changelog that
      // would be discarded. The authoritative check is the one after the comparison phase.
      assertReleaseIsPublishable(config.status, buildResult.notifications, [])

      if (!builderContextObject.builderRunOptions.withoutDeprecatedDepth && previousVersionCache) {
        await calculateHistoryForDeprecatedItems(
          REST_API_TYPE,
          getOperationsList(buildResult),
          previousVersionCache!.version,
          previousVersionPackageId || packageId,
          builderContextObject,
        )
      }
    }

    if (!builderContextObject.builderRunOptions.withoutChangelog && previousVersionCache) {
      const compareResult = await compareVersions(
        [previousVersionCache.version, previousVersionPackageId || packageId],
        [version, packageId],
        compareContextObject,
        rootNotifications,
      )
      buildResult.comparisons = compareResult.comparisons
      buildResult.ddlComparisons = compareResult.ddlComparisons
      applyBuilderVersionInfo(config, compareResult)
    } else if (rootNotifications.length) {
      // no comparison ran, so the packager files these under the pair the config declared
      replaceInPlace(buildResult.comparisonNotifications, rootNotifications)
    }

    // authoritative: it sees both streams, including every message the comparison phase raised
    assertReleaseIsPublishable(config.status, buildResult.notifications, comparisonPhaseNotifications(buildResult))

    return buildResult
  }
}
