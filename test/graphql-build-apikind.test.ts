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
  APIHUB_API_COMPATIBILITY_KIND_EXPERIMENTAL,
  APIHUB_API_COMPATIBILITY_KIND_NO_BWC,
  ApihubApiCompatibilityKind,
  BuildResult,
  Labels,
} from '../src'
import { buildPackageFromContent } from './helpers'

const BWC = APIHUB_API_COMPATIBILITY_KIND_BWC
const NO_BWC = APIHUB_API_COMPATIBILITY_KIND_NO_BWC
const EXPERIMENTAL = APIHUB_API_COMPATIBILITY_KIND_EXPERIMENTAL

const FILE_ID = 'spec.gql'
const SDL = 'type Query {\n  fruits: String\n  vegetables: String\n}' // two operations

describe('GraphQL build api-kind', () => {
  // Document apiKind + apiKind of every operation — they must all match.
  const documentAndOperationsApiKind = (result: BuildResult): (ApihubApiCompatibilityKind | undefined)[] => {
    const document = result.documents.get(FILE_ID)
    const operations = Array.from(result.operations.values())
    return [document?.apiKind, ...operations.map(operation => operation.apiKind)]
  }

  it.each<{ id: string; desc: string; fileLabels?: Labels; versionLabels?: Labels; expected: ApihubApiCompatibilityKind }>([
    { id: 'default', desc: 'no labels → BWC by default', expected: BWC },
    { id: 'file-nb', desc: 'file label no-BWC', fileLabels: ['apihub/x-api-kind: no-BWC'], expected: NO_BWC },
    { id: 'file-exp', desc: 'file label experimental', fileLabels: ['apihub/x-api-kind: experimental'], expected: EXPERIMENTAL },
    { id: 'version-nb', desc: 'version label no-BWC', versionLabels: ['apihub/x-api-kind: no-BWC'], expected: NO_BWC },
    { id: 'invalid', desc: 'invalid label value → BWC', fileLabels: ['apihub/x-api-kind: broken'], expected: BWC },
  ])('should apply $desc to the document and all its operations', async ({ id, fileLabels, versionLabels, expected }) => {
    const result = await buildPackageFromContent(`gql-build-apikind/${id}`, FILE_ID, SDL, fileLabels, versionLabels)

    const apiKinds = documentAndOperationsApiKind(result)
    expect(apiKinds).toHaveLength(3) // document + 2 operations
    for (const apiKind of apiKinds) {
      expect(apiKind).toEqual(expected)
    }
  })

  it('should let the file label override the version label', async () => {
    const result = await buildPackageFromContent(
      'gql-build-apikind/file-over-version', FILE_ID, SDL,
      ['apihub/x-api-kind: no-BWC'], ['apihub/x-api-kind: BWC'],
    )

    for (const apiKind of documentAndOperationsApiKind(result)) {
      expect(apiKind).toEqual(NO_BWC)
    }
  })
})
