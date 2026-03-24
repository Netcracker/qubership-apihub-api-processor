import {
  buildChangelogPackageDefaultConfig,
  changesSummaryMatcher,
  numberOfImpactedOperationsMatcher,
} from './helpers'
import { ANNOTATION_CHANGE_TYPE, ASYNCAPI_API_TYPE, BREAKING_CHANGE_TYPE, UNCLASSIFIED_CHANGE_TYPE } from '../src'

/**
 * Tests for AsyncAPI diff deduplication.
 *
 * Deduplication in AsyncAPI works at two stages:
 *
 * Within one document pair (by reference identity):
 *   - `aggregateDiffsWithRollup` propagates diffs bottom-up via Set<Diff>
 *   - Same Diff instance can appear in multiple operations (e.g. shared component schema)
 *   - `comparePairedDocs` deduplicates via `new Set(allDiffs)` — reference identity
 *   - `collectExclusiveOtherMessageDiffs` filters sibling message diffs so they don't
 *     leak into unrelated (operation, message) pairs
 *
 * Across multiple document pairs (by content hash):
 *   - Rare case: one operation in multiple documents → multiple apiDiff() calls
 *   - Uses `removeObjectDuplicates(diffs, calculateDiffId)` for content-based dedup
 */
describe('AsyncAPI deduplication tests', () => {

  describe('Shared entities in the same specification', () => {
    test('shared schema, different scopes (receive vs send)', async () => {
      // Two operations (operation1=receive, operation2=send) on different channels,
      // both messages referencing SharedPayload. Changing SharedPayload type (number → string).
      // apiDiff resolves $refs per scope → separate diff instances per scope.
      const result = await buildChangelogPackageDefaultConfig('asyncapi-deduplication/shared-schema-across-operations')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
    })

    test('shared schema, same scope (both receive)', async () => {
      // Two operations (both receive) on different channels,
      // both messages referencing SharedPayload. Changing SharedPayload type (number → string).
      // Same scope → diffs should be deduplicated by reference identity within one apiDiff call.
      const result = await buildChangelogPackageDefaultConfig('asyncapi-deduplication/shared-schema-same-scope')

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
    })

    test('should count info.version change once in changesSummary but impact all operations', async () => {
      // Two operations. info.version changed (1.0.0 → 2.0.0).
      // The info diff is extracted and added to every operation via extractInfoDiffs(),
      // but it's the same semantic change — changesSummary should count 1, impacted 2.
      const result = await buildChangelogPackageDefaultConfig('asyncapi-deduplication/root-info-change-multiple-operations')

      expect(result).toEqual(changesSummaryMatcher({ [ANNOTATION_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [ANNOTATION_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
    })

    test('should count root server change once in changesSummary but impact all operations', async () => {
      // Two operations on different channels, both channels reference servers.production.
      // Root server host changed (old → new).
      // Each scope (receive/send) gets its own unclassified diff via channel.servers aggregation.
      // No root-level diffs — server diffs come only through channel aggregation.
      // unclassified: 2 in summary (one per scope), impacted 2.
      const result = await buildChangelogPackageDefaultConfig('asyncapi-deduplication/root-server-change-multiple-operations')

      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
    })
  })

  describe('Shared entities across different specifications', () => {
    test('shared schema name in two specs, different scopes (receive vs send)', async () => {
      // operation1 (receive) in doc1, operation2 (send) in doc2.
      // Both specs define SharedPayload with same change (number → string).
      // Different scopes → separate apiDiff calls → separate diff instances.
      // Cross-document content-based dedup (calculateDiffId) applies per operation,
      // but these are different operations so both changes are counted.
      const result = await buildChangelogPackageDefaultConfig(
        'asyncapi-deduplication/shared-schema-cross-specs',
        [{ fileId: 'before1.yaml', publish: true }, { fileId: 'before2.yaml', publish: true }],
        [{ fileId: 'after1.yaml' }, { fileId: 'after2.yaml' }],
      )

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
    })

    test('shared schema name in two specs, same scope (both receive)', async () => {
      // operation1 (receive) in doc1, operation2 (receive) in doc2.
      // Both specs define SharedPayload with same change (number → string).
      // Same scope → same group, but different documents → separate doc pairs → two apiDiff calls.
      // Cross-document content-based dedup via calculateDiffId merges identical diffs.
      const result = await buildChangelogPackageDefaultConfig(
        'asyncapi-deduplication/shared-schema-cross-specs-same-scope',
        [{ fileId: 'before1.yaml', publish: true }, { fileId: 'before2.yaml', publish: true }],
        [{ fileId: 'after1.yaml' }, { fileId: 'after2.yaml' }],
      )

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
    })

    test('same schema name in two specs but different content should not deduplicate', async () => {
      // operation1 in doc1 with SharedPayload{userId: number→string},
      // operation2 in doc2 with SharedPayload{orderId: integer→string}.
      // Same schema name but different properties/changes → no dedup, both counted separately.
      const result = await buildChangelogPackageDefaultConfig(
        'asyncapi-deduplication/shared-schema-cross-specs-different-content',
        [{ fileId: 'before1.yaml', publish: true }, { fileId: 'before2.yaml', publish: true }],
        [{ fileId: 'after1.yaml' }, { fileId: 'after2.yaml' }],
      )

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 2 }, ASYNCAPI_API_TYPE))
    })
  })

  describe('Message-level isolation', () => {
    test('should not leak add-message diff to existing sibling message operations', async () => {
      // operation1 has message1, message2. message3 is added.
      // The array-level diff for adding message3 should only appear on the new operation1-message3,
      // not on operation1-message1 or operation1-message2.
      // collectExclusiveOtherMessageDiffs filters out the sibling's array-level diff.
      const result = await buildChangelogPackageDefaultConfig('asyncapi-deduplication/add-message-no-sibling-impact')

      // Only 1 breaking change (the added message3 operation), impacting 1 operation
      expect(result).toEqual(changesSummaryMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should correctly separate operation-level and message-level changes', async () => {
      // operation1 with message1 and message2.
      // Changes: operation description changed (annotation, shared by both messages)
      //        + message1 contentType changed (breaking, specific to message1 only)
      //
      // Expected: annotation (description) = 1 in summary, impacted 2 (both messages)
      //           breaking (contentType) = 1 in summary, impacted 1 (only message1)
      const result = await buildChangelogPackageDefaultConfig('asyncapi-deduplication/mixed-operation-and-message-changes')

      expect(result).toEqual(changesSummaryMatcher({
        [ANNOTATION_CHANGE_TYPE]: 1,
        [BREAKING_CHANGE_TYPE]: 1,
      }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({
        [ANNOTATION_CHANGE_TYPE]: 2,
        [BREAKING_CHANGE_TYPE]: 1,
      }, ASYNCAPI_API_TYPE))
    })
  })

  describe('Cross-document deduplication', () => {
    test('should deduplicate diffs when same operation appears in multiple document pairs', async () => {
      // Same operation (operation1-message1) described in two documents:
      // before1.yaml/after1.yaml and before2.yaml/after2.yaml.
      // Both document pairs produce identical semantic changes (userId type: number → string).
      // Level 2 dedup via calculateDiffId should ensure diffs are not counted twice.
      const result = await buildChangelogPackageDefaultConfig(
        'asyncapi-deduplication/cross-document-dedup',
        [{ fileId: 'before1.yaml', publish: true }, { fileId: 'before2.yaml', publish: true }],
        [{ fileId: 'after1.yaml' }, { fileId: 'after2.yaml' }],
      )

      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })
  })
})
