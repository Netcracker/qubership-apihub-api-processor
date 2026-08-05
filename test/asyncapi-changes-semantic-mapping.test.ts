import { getCompatibilitySuite, TEST_SPEC_TYPE_ASYNC_API } from '@netcracker/qubership-apihub-compatibility-suites'

import {
  buildChangelogFromContent,
  changesSummaryMatcher,
  noChangesMatcher,
  numberOfImpactedOperationsMatcher,
  operationChangesMatcher,
} from './helpers'
import {
  ANNOTATION_CHANGE_TYPE,
  ASYNCAPI_API_TYPE,
  BREAKING_CHANGE_TYPE,
  BuildResult,
  EMPTY_CHANGE_SUMMARY,
  OperationChanges,
  UNCLASSIFIED_CHANGE_TYPE,
} from '../src'

/**
 * Changelog behaviour when an AsyncAPI generator re-hashes an id because some description text
 * changed. Driven by the shared `semantic-mapping` corpus, so api-diff and api-processor assert
 * against the same documents.
 */
const SUITE_ID = 'semantic-mapping'

const buildChangelogForCase = (testId: string): Promise<BuildResult> => {
  const [before, after] = getCompatibilitySuite(TEST_SPEC_TYPE_ASYNC_API, SUITE_ID, testId)
  // A package id per case, so the local registry never reuses another case's published version.
  return buildChangelogFromContent(`semantic-mapping-${testId}`, before, after)
}

const changesOf = (result: BuildResult): OperationChanges[] =>
  result.comparisons?.flatMap(comparison => comparison.data ?? []) ?? []

const expectNoChanges = (result: BuildResult): void => {
  expect(result).toEqual(noChangesMatcher(ASYNCAPI_API_TYPE))
  expect(result).toEqual(numberOfImpactedOperationsMatcher(EMPTY_CHANGE_SUMMARY, ASYNCAPI_API_TYPE))
}

describe('AsyncAPI semantic entity mapping changelog', () => {
  describe('an id flip alone produces no changelog record', () => {
    it.each([
      'message-id-changed',
      'channel-id-changed',
      'operation-id-changed',
      'all-ids-changed',
      'message-id-changed-in-multi-message-operation',
      'message-id-changed-in-operation-reply',
      'message-id-renamed-manually',
    ])('%s', async testId => {
      // api-diff reports no diffs at all, so `compareDocuments` returns early and no record is
      // written. Before this work each of these was a breaking removal plus an addition.
      expectNoChanges(await buildChangelogForCase(testId))
    })
  })

  describe('a real change is reported once, against the previous operation', () => {
    it('message-id-changed-with-description reports one annotation change', async () => {
      const result = await buildChangelogForCase('message-id-changed-with-description')
      const changes = changesOf(result)

      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(changes).toHaveLength(1) // one operation touched, not one removed and one added
      // The id changed, so the record spans two different ids - which is exactly what the pairing
      // exists to produce, and what the ui needs to show a single changed operation.
      expect(changes[0].operationId).not.toEqual(changes[0].previousOperationId)
      expect(changes[0].previousOperationId).toContain('OrderEvent_1001')
      expect(changes[0].operationId).toContain('OrderEvent_2002')
    })

    it('message-id-changed-with-payload reports one breaking change', async () => {
      const result = await buildChangelogForCase('message-id-changed-with-payload')
      const changes = changesOf(result)

      // The payload changed *and* the id flipped. Matching on the payload's declaration path -
      // not its content - is what still pairs the two, so the change lands inside the operation
      // rather than reading as one operation removed and another added.
      //
      // Two records, not one: both messages of the baseline share `components/schemas/OrderEvent`,
      // so adding a property to it touches both operations. Only one of them changed its id.
      expect(changes).toHaveLength(2)
      const flipped = changes.find(change => change.operationId?.includes('OrderEvent_2002'))
      expect(flipped).toBeDefined()
      expect(flipped!.previousOperationId).toBe('sendOrderEvent_1001-OrderEvent_1001')
      expect(flipped!.operationId).toBe('sendOrderEvent_1001-OrderEvent_2002')
      // The other operation kept its id on both sides.
      const stable = changes.find(change => change !== flipped)!
      expect(stable.previousOperationId).toBe(stable.operationId)
    })

    it('message-id-changed-and-message-removed reports exactly one removal', async () => {
      const result = await buildChangelogForCase('message-id-changed-and-message-removed')

      // Only the genuinely removed operation; the flipped message matched and reports nothing.
      // A removal has a previous id and no current one - there is no current operation to name.
      expect(changesOf(result)).toHaveLength(1)
      expect(result).toEqual(operationChangesMatcher([
        expect.objectContaining({ previousOperationId: 'sendOrderCancelled-OrderCancelled' }),
      ]))
    })

    it('message-id-changed-and-message-added reports exactly one addition', async () => {
      const result = await buildChangelogForCase('message-id-changed-and-message-added')

      expect(changesOf(result)).toHaveLength(1) // the added message only
      expect(result).toEqual(operationChangesMatcher([
        expect.objectContaining({ operationId: expect.stringContaining('OrderCancelled') }),
      ]))
    })
  })

  describe('an entity with no semantic identity keeps the old behaviour', () => {
    it('message-id-changed-with-inline-payload reports a removal and an addition', async () => {
      const result = await buildChangelogForCase('message-id-changed-with-inline-payload')

      // An inline payload declares under `components/messages/<hashedId>/payload`, which carries
      // the very id we are looking past, so there is no anchor and the pair is left unmatched.
      // A documented degradation, not a defect - and the shape of that degradation is exactly the
      // old behaviour: the operation under the previous id removed, the one under the new id
      // added, each one-sided.
      const changes = changesOf(result)

      expect(changes).toHaveLength(2)
      expect(changes.map(change => change.previousOperationId))
        .toIncludeSameMembers(['sendOrderEvent_1001-OrderEvent_1001', undefined])
      expect(changes.map(change => change.operationId))
        .toIncludeSameMembers([undefined, 'sendOrderEvent_1001-OrderEvent_2002'])
    })
  })

  describe('an ambiguous group pairs deterministically', () => {
    it('both-channel-ids-changed reports nothing', async () => {
      // Two channels on one address with one identical-payload message each: they share an
      // identity exactly, so any 1-1 pairing is defensible and the tie-break decides which. The
      // tie-break happens to pick the swap, which api-diff surfaces as channel and message
      // *description* changes.
      //
      // None of that reaches an operation. Both operation ids are unchanged, so they pair by key,
      // and a channel description is not part of any operation's own subtree - so the changelog
      // is empty. Without semantic mapping this pair would have reported operations removed and
      // added.
      expectNoChanges(await buildChangelogForCase('both-channel-ids-changed'))
    })
  })
})
