
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

  test('should detect no changes for identical documents', async () => {
    const result = await buildChangelogPackageDefaultConfig(
      'asyncapi-changes/no-changes',
      [{ fileId: 'before.yaml', publish: true }],
      [{ fileId: 'before.yaml', publish: true }],
    )

    expectNoChanges(result)
  })

  describe('Operations tests', () => {
    test('should detect added operation', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/operation/add')
      expect(result).toEqual(changesSummaryMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should detect multiple added operations', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/operation/add-multiple')
      expect(result).toEqual(changesSummaryMatcher({ [NON_BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [NON_BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
    })

    test('should detect removed operation', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/operation/remove')
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should detect simultaneously added and removed operations', async () => {
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

    test('should detect renamed operation as add and remove', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/operation/rename')
      expect(result).toEqual(changesSummaryMatcher({
        [BREAKING_CHANGE_TYPE]: 2,
      }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({
        [BREAKING_CHANGE_TYPE]: 2,
      }, ASYNCAPI_API_TYPE))
    })

    test('should detect changed operation action type', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/operation/change-action')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should not impact other operation when changing action type', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/operation/change-action-no-impact-on-other')

      // operation1 action changed (receive -> send), operation2 unchanged
      // should only impact 1 apihub operation (operation1-message1)
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should detect changed operation description with multiple messages', async () => {
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
    test('should detect changed operation channel reference', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/channel/change-reference')

      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should detect removed channel', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/channel/remove')

      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should not detect changes when removing unused channel', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/channel/remove-unused')

      expectNoChanges(result)
    })

    test('should detect changed channel address', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/channel/change-address')

      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should detect added message definition in channel', async () => {
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

    test('should detect added message definition in channel with multiple apihub operations', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/channel/add-message-with-multiple-operations')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
    })
  })

  describe('Servers tests', () => {
    test('should detect added server in channel', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/server/add-to-channel')

      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should detect removed server from channel', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/server/remove-from-channel')

      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should not detect changes when adding root servers', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/server/add-root')

      expectNoChanges(result)
    })

    test('should not detect changes when removing root servers', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/server/remove-root')

      expectNoChanges(result)
    })

    test('should not detect changes when changing root servers', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/server/change-root')

      expectNoChanges(result)
    })
  })

  describe('Messages tests', () => {
    test('should detect added message reference in operation', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/add-to-operation')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should detect removed message reference from operation', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/remove-from-operation')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should detect changed message content type', async () => {
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

    test('should not add changes to existing messages when adding new message to operation', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/add-to-operation-with-existing-messages')

      // Adding message3 to operation with existing message1 and message2
      // should only impact 1 new apihub operation (operation1-message3),
      // not the existing operation1-message1 and operation1-message2
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

    test('should not detect changes when removing unused message from channel', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/remove-unused-from-channel')

      // Removing a message definition from channel that no operation references
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should not detect changes when adding unused component message', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/add-unused-component-message')

      // Adding a message to components/messages that is not referenced by any channel or operation
      // should not impact any apihub operations
      expectNoChanges(result)
    })

    test('should not detect changes when removing unused component message', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/message/remove-unused-component-message')

      // Removing a message from components/messages that is not referenced by any operation
      // should not impact any apihub operations
      expectNoChanges(result)
    })
  })

  describe('Schema tests', () => {
    test('should detect added property in message schema', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/schema/add-property')

      expect(result).toEqual(changesSummaryMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should detect removed property from message schema', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/schema/remove-property')

      expect(result).toEqual(changesSummaryMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should detect changed property type in message schema', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/schema/change-property-type')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })
  })

  describe('Info tests', () => {
    test('should detect changed info version', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/info/change-version')

      // info.version changed (1.0.0 -> 2.0.0) — should be detected as a change in every apihub operation
      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should detect changed info title', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changes/info/change-title')

      // info.title changed — should be detected as a change in every apihub operation
      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
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
