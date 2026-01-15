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
  buildChangelogPackage,
  changesSummaryMatcher,
  numberOfImpactedOperationsMatcher,
  operationTypeMatcher,
} from './helpers'
import {
  ANNOTATION_CHANGE_TYPE,
  ASYNCAPI_API_TYPE,
  BREAKING_CHANGE_TYPE,
  NON_BREAKING_CHANGE_TYPE,
  UNCLASSIFIED_CHANGE_TYPE,
} from '../src'

describe('AsyncAPI 3.0 Changelog', () => {

  describe('Channels', () => {
    test('Add channel', async () => {
      const result = await buildChangelogPackage('asyncapi-changes/channel/add')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('Remove channel', async () => {
      const result = await buildChangelogPackage('asyncapi-changes/channel/remove')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('Change channel address', async () => {
      const result = await buildChangelogPackage('asyncapi-changes/channel/change')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })
  })

  describe('Operations tests', () => {
    test('Add operation', async () => {
      const result = await buildChangelogPackage('asyncapi-changes/operation/add')
      expect(result).toEqual(changesSummaryMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('Remove operation', async () => {
      const result = await buildChangelogPackage('asyncapi-changes/operation/remove')
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('Change operation', async () => {
      const result = await buildChangelogPackage('asyncapi-changes/operation/change')

      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    // wrong
    test('Rename operation', async () => {
      const result = await buildChangelogPackage('asyncapi-changes/operation/rename')
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })
  })

  describe('Servers', () => {
    test('Add server', async () => {
      const result = await buildChangelogPackage('asyncapi-changes/server/add')

      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('Remove server', async () => {
      const result = await buildChangelogPackage('asyncapi-changes/server/remove')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('Change server', async () => {
      const result = await buildChangelogPackage('asyncapi-changes/server/change')

      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('Add root servers', async () => {
      const result = await buildChangelogPackage('asyncapi-changes/server/add-root')

      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('Remove root servers', async () => {
      const result = await buildChangelogPackage('asyncapi-changes/server/remove-root')

      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('Change root servers', async () => {
      const result = await buildChangelogPackage('asyncapi-changes/server/change-root')

      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })
  })

  describe('tags', () => {
    test('Tags are not duplicated', async () => {
      const result = await buildChangelogPackage('asyncapi-changes/tags')

      expect(result).toEqual(operationTypeMatcher({
        tags: expect.toIncludeSameMembers([
          'sameTagInDifferentChannels1',
          'sameTagInDifferentChannels2',
          'sameTagInDifferentChannels3',
          'sameTagInDifferentSiblings1',
          'sameTagInDifferentSiblings2',
          'sameTagInDifferentSiblings3',
          'tag',
        ]),
      }))
    })
  })
})
