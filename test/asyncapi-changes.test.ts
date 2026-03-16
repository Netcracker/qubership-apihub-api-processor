
import {
  buildChangelogPackageDefaultConfig,
  changesSummaryMatcher,
  noChangesMatcher,
  numberOfImpactedOperationsMatcher,
  operationTypeMatcher,
} from './helpers'
import {
  ANNOTATION_CHANGE_TYPE,
  ASYNCAPI_API_TYPE,
  BREAKING_CHANGE_TYPE, BuildResult, EMPTY_CHANGE_SUMMARY,
  NON_BREAKING_CHANGE_TYPE,
  UNCLASSIFIED_CHANGE_TYPE,
} from '../src'

describe('AsyncAPI 3.0 Changelog tests', () => {

  const expectNoChanges = (result: BuildResult): void =>  {
    expect(result).toEqual(noChangesMatcher(ASYNCAPI_API_TYPE))
    expect(result).toEqual(numberOfImpactedOperationsMatcher(EMPTY_CHANGE_SUMMARY, ASYNCAPI_API_TYPE))
  }

  test('should report no changes for identical documents', async () => {
    const result = await buildChangelogPackageDefaultConfig(
      'asyncapi-changes/no-changes',
      [{ fileId: 'before.yaml', publish: true }],
      [{ fileId: 'before.yaml', publish: true }],
    )

    expectNoChanges(result)
  })

  describe('Operations tests', () => {
    test('should report added operation', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/operation/add')
      expect(result).toEqual(changesSummaryMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report multiple added operations', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/operation/add-multiple')
      expect(result).toEqual(changesSummaryMatcher({ [NON_BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [NON_BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
    })

    test('should report removed operation', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/operation/remove')
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report simultaneously added and removed operations', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/operation/add-remove')
      expect(result).toEqual(changesSummaryMatcher({
        [BREAKING_CHANGE_TYPE]: 1,
        [NON_BREAKING_CHANGE_TYPE]: 1,
      }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({
        [BREAKING_CHANGE_TYPE]: 1,
        [NON_BREAKING_CHANGE_TYPE]: 1,
      }, ASYNCAPI_API_TYPE))
    })

    test('should report changed operation action type', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/operation/change-action')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report changed operation description with multiple messages', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/operation/change-description-with-multiple-messages')

      expect(result).toEqual(changesSummaryMatcher({
        [ANNOTATION_CHANGE_TYPE]: 1,
      }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({
        [ANNOTATION_CHANGE_TYPE]: 2,
      }, ASYNCAPI_API_TYPE))
    })
  })

  describe('Channels tests', () => {
    test('should be tolerant to channel reference change', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/channel/change-reference')

      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should not report changes when removing unused channel', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/channel/remove-unused')

      expectNoChanges(result)
    })

    test('should report changed channel address', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/channel/change-address')

      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report added message definition in channel', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/channel/add-message')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should impact all operations on shared channel when changing address', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/channel/change-address-shared-channel')

      // operation1 and operation2 both reference channel1, address changed
      // both apihub operations should be impacted
      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
    })

    test('should not impact operation on other channel when changing address', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/channel/change-address-no-impact-on-other-channel')

      // channel1 address changed, channel2 unchanged
      // only operation1 (on channel1) should be impacted, not operation2 (on channel2)
      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report added message definition in channel with multiple apihub operations', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/channel/add-message-with-multiple-operations')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
    })
  })

  describe('Servers tests', () => {
    test('should report added server in channel', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/server/add-to-channel')

      // channel-level servers diff (unclassified) + root servers diff (annotation)
      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1, [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1, [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report removed server from channel', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/server/remove-from-channel')

      // channel-level servers diff (unclassified) + root servers diff (annotation)
      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1, [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1, [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report changed server used in channel', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/server/change-in-channel')

      // Server host changed; server is at root level but referenced by channel
      // root-level diff (annotation) + operation-level resolved diff (unclassified)
      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1, [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 1, [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report added root servers', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/server/add-root')

      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report removed root servers', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/server/remove-root')

      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report changed root servers', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/server/change-root')

      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })
  })

  describe('Messages tests', () => {
    test('should report added APIHUB operation when message reference is added to async operation', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/add-to-operation')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report removed APIHUB operation when message reference is removed to async operation', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/remove-from-operation')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report changed message content type', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/change-content-type')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should not impact other operation when adding message to one', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/add-to-one-of-multiple-operations')

      // message2 added to operation1, operation2 unchanged
      // should only impact 1 new apihub operation (operation1-message2)
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should not add changes to remaining messages when removing message from operation', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/remove-from-operation-with-remaining-messages')

      // Removing message2 from operation with message1, message2, message3
      // should only impact 1 removed apihub operation (operation1-message2),
      // not the remaining operation1-message1 and operation1-message3
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should only impact changed message when changing content type with multiple messages', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/change-content-type-with-multiple-messages')

      // Changing contentType of message1 in operation with message1 and message2
      // should only impact operation1-message1, not operation1-message2
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should impact both operations when changing shared payload with multiple messages', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/change-shared-payload-with-multiple-messages')

      // message1 and message2 both reference SharedPayload schema
      // changing SharedPayload type should impact both apihub operations
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
    })

    test('should not report changes when adding unused component message', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/add-unused-component-message')

      // Adding a message to components/messages that is not referenced by any channel or operation
      // should not impact any apihub operations
      expectNoChanges(result)
    })

    test('should not report changes when removing unused component message', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/remove-unused-component-message')

      // Removing a message from components/messages that is not referenced by any operation
      // should not impact any apihub operations
      expectNoChanges(result)
    })
  })

  describe('Schema tests', () => {
    test('should report added property in message schema', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/schema/add-property')

      expect(result).toEqual(changesSummaryMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report removed property from message schema', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/schema/remove-property')

      expect(result).toEqual(changesSummaryMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report changed property type in message schema', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/schema/change-property-type')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })
  })

  describe('Info tests', () => {
    test('should report changed info version', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/info/change-version')

      // info.version changed (1.0.0 -> 2.0.0) — should be detected as a change in every apihub operation
      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report changed info title', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/info/change-title')

      // info.title changed — should be detected as a change in every apihub operation
      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report changed document id', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/info/change-id')

      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should report changed defaultContentType', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/info/change-default-content-type')

      // Root-level defaultContentType change + propagated breaking change in message contentType
      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1, [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1, [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })
  })

  describe('Tags tests', () => {
    test('should not duplicate tags', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/tags')

      expect(result).toEqual(operationTypeMatcher({
        tags: expect.toIncludeSameMembers([
          'sameTagInDifferentChannels1',
          'sameTagInDifferentChannels2',
          'sameTagInDifferentChannels3',
          'sameTagInDifferentSiblings1',
          'sameTagInDifferentSiblings2',
          'sameTagInDifferentSiblings3',
          'sameTagInOperationSiblings1',
          'tag',
        ]),
      }))
    })
  })
})
