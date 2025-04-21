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
  BuildConfig,
  BuildResult,
  BuildTypeContexts,
  TRANSFORMATION_KIND_MERGED,
  TRANSFORMATION_KIND_REDUCED,
} from '../types'
import { DocumentGroupStrategy } from './document-group.strategy'
import { MergedDocumentGroupStrategy } from './merged-document-group.strategy'

export class ExportRestOperationsGroupStrategy extends DocumentGroupStrategy {
  async execute(config: BuildConfig, buildResult: BuildResult, contexts: BuildTypeContexts): Promise<BuildResult> {

    switch (config.operationsSpecTransformation) {
      case TRANSFORMATION_KIND_MERGED:
        await new MergedDocumentGroupStrategy().execute(config, buildResult, contexts)
        break
      case TRANSFORMATION_KIND_REDUCED:
        await new DocumentGroupStrategy().execute(config, buildResult, contexts)
        break
    }

    return buildResult
  }
}
