import {
  getCompatibilitySuite,
  getCompatibilitySuites,
  TEST_SPEC_TYPE_ASYNC_API,
} from '@netcracker/qubership-apihub-compatibility-suites'

import {
  buildChangelogFromContent,
  buildChangelogFromFiles,
  changesSummaryMatcher,
  LocalRegistry,
  noChangesMatcher,
  numberOfImpactedOperationsMatcher,
  operationChangesMatcher,
} from './helpers'
import {
  ANNOTATION_CHANGE_TYPE,
  ASYNCAPI_API_TYPE,
  BUILD_TYPE,
  BuildResult,
  EMPTY_CHANGE_SUMMARY,
  NON_BREAKING_CHANGE_TYPE,
  NotificationMessage,
  OperationChanges,
  REST_API_TYPE,
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

/** Every case of the corpus, so a case added there is covered here without a second edit. */
const ALL_CASE_IDS: string[] = [
  ...(getCompatibilitySuites(TEST_SPEC_TYPE_ASYNC_API).get(SUITE_ID) ?? []),
].sort()

const isPairingDisagreement = (notification: NotificationMessage): boolean =>
  notification.message.includes('pairing disagreement')

/** Names the build rejection in the failure message instead of leaving a bare unhandled reject. */
const expectResolved = async (build: Promise<BuildResult>): Promise<BuildResult> => {
  await expect(build).resolves.toBeDefined()
  return build
}

const expectNoChanges = (result: BuildResult): void => {
  expect(result).toEqual(noChangesMatcher(ASYNCAPI_API_TYPE))
  expect(result).toEqual(numberOfImpactedOperationsMatcher(EMPTY_CHANGE_SUMMARY, ASYNCAPI_API_TYPE))
}

/** One AsyncAPI document whose message id is parameterised, so a flip is one argument away. */
const ordersDocument = (messageId: string): string => `asyncapi: 3.0.0
info:
  title: Orders
  version: 1.0.0
channels:
  orderEvents_1001:
    address: order-events
    messages:
      ${messageId}:
        $ref: '#/components/messages/${messageId}'
operations:
  sendOrderEvent_1001:
    action: send
    channel:
      $ref: '#/channels/orderEvents_1001'
    messages:
      - $ref: '#/channels/orderEvents_1001/messages/${messageId}'
components:
  schemas:
    OrderEvent:
      type: object
      properties:
        orderId:
          type: string
  messages:
    ${messageId}:
      payload:
        $ref: '#/components/schemas/OrderEvent'
`

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

  describe('pairing spans documents', () => {

    const AUDIT_DOCUMENT = `asyncapi: 3.0.0
info:
  title: Audit
  version: 1.0.0
channels:
  auditEvents:
    address: audit-events
    messages:
      AuditEvent:
        $ref: '#/components/messages/AuditEvent'
operations:
  sendAuditEvent:
    action: send
    channel:
      $ref: '#/channels/auditEvents'
    messages:
      - $ref: '#/channels/auditEvents/messages/AuditEvent'
components:
  schemas:
    AuditEvent:
      type: object
      properties:
        auditId:
          type: string
  messages:
    AuditEvent:
      payload:
        $ref: '#/components/schemas/AuditEvent'
`

    it('matches an operation whose id flips and whose document is renamed', async () => {
      // Pairing works off the flat operations map, which spans every document of a version, so a
      // document rename is invisible to it - and `calculatePairedDocs` then derives the document
      // pair from the operation pair, so the two documents line up because the operation did.
      const result = await buildChangelogFromFiles(
        'semantic-mapping-cross-document',
        { 'orders.yaml': ordersDocument('OrderEvent_1001'), 'audit.yaml': AUDIT_DOCUMENT },
        { 'orders-v2.yaml': ordersDocument('OrderEvent_2002'), 'audit.yaml': AUDIT_DOCUMENT },
      )

      expectNoChanges(result)
      expect(result.notifications.filter(isPairingDisagreement)).toEqual([])
    })

    it('leaves REST pairing alone in a mixed-API version pair', async () => {
      // `mapOperations` is opt-in per builder and REST declares none, so REST keeps plain id
      // equality. This pins that: the AsyncAPI ids flip and report nothing, while a genuinely
      // added REST operation is still reported as added.
      const restDocument = (extraPath: string): string => `openapi: 3.0.0
info:
  title: Orders REST
  version: 1.0.0
paths:
  /orders:
    get:
      responses:
        '200':
          description: ok${extraPath}
`
      const result = await buildChangelogFromFiles(
        'semantic-mapping-mixed-api',
        { 'orders.yaml': ordersDocument('OrderEvent_1001'), 'rest.yaml': restDocument('') },
        {
          'orders.yaml': ordersDocument('OrderEvent_2002'),
          'rest.yaml': restDocument(`
  /orders/{id}:
    get:
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: ok`),
        },
      )

      expect(result).toEqual(changesSummaryMatcher({ [NON_BREAKING_CHANGE_TYPE]: 1 }, REST_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher(EMPTY_CHANGE_SUMMARY, ASYNCAPI_API_TYPE))
      expect(result.notifications.filter(isPairingDisagreement)).toEqual([])
    })
  })

  describe('dashboards inherit the pairing', () => {
    it('reports no changes for a hash-flipping ref package', async () => {
      // A dashboard aggregates its refs' comparisons rather than comparing anything itself, so a
      // ref whose ids flip must reach the dashboard changelog as nothing at all - the same result
      // the ref package gets on its own.
      const refId = 'semantic-mapping/dashboard-ref'
      const dashboardId = 'semantic-mapping/dashboard'

      const ref = LocalRegistry.openPackage(refId)
      for (const [version, messageId] of [['v1', 'OrderEvent_1001'], ['v2', 'OrderEvent_2002']]) {
        await ref.publishFromContent(
          { 'orders.yaml': ordersDocument(messageId) },
          { packageId: refId, version, buildType: BUILD_TYPE.BUILD, files: [{ fileId: 'orders.yaml' }] },
        )
      }

      const dashboard = LocalRegistry.openPackage(dashboardId)
      await dashboard.publishFromContent(
        {},
        { packageId: dashboardId, version: 'v1', buildType: BUILD_TYPE.BUILD, refs: [{ refId, version: 'v1' }], files: [] },
      )
      const result = await dashboard.publishFromContent(
        {},
        {
          packageId: dashboardId,
          version: 'v2',
          previousVersion: 'v1',
          buildType: BUILD_TYPE.BUILD,
          refs: [{ refId, version: 'v2' }],
          files: [],
        },
      )

      expect(changesOf(result)).toEqual([])
      expect(result.notifications.filter(isPairingDisagreement)).toEqual([])
    }, 100000)
  })

  describe('api-diff and the operation pairing agree', () => {
    // api-diff decides which entities correspond, and everyone else reads that
    // decision. Where the pre-pairing disagrees, `compareDocuments` resolves from the merged
    // document *and* raises a Warning notification - so an empty notification list is what proves
    // the two never had to be reconciled.
    it.each(ALL_CASE_IDS)('%s', async testId => {
      // The other failure mode is `compareDocuments` throwing `Can't find the <id> operation` when
      // neither id resolves. That aborts the build rather than recording anything, so it is
      // asserted as a non-rejection rather than by inspecting the result.
      const result = await expectResolved(buildChangelogForCase(testId))

      expect(result.notifications.filter(isPairingDisagreement)).toEqual([])
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
