import {
  buildChangelogPackageDefaultConfig,
  changesSummaryMatcher,
  numberOfImpactedOperationsMatcher,
} from './helpers'
import { ASYNCAPI_API_TYPE, BREAKING_CHANGE_TYPE, RISKY_CHANGE_TYPE, UNCLASSIFIED_CHANGE_TYPE } from '../src'

describe('AsyncAPI changelog api-kind tests', () => {
  type ApiKindCase = [string, string, Record<string, number>]

  const runApiKindCases = (scope: string, cases: ApiKindCase[]): void => {
    test.each(cases)('%s (%s)', async (_description, caseName, expected) => {
      const result = await buildChangelogPackageDefaultConfig(`asyncapi-changelog-apikind/${scope}/${caseName}`)
      expect(result).toEqual(changesSummaryMatcher(expected, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher(expected, ASYNCAPI_API_TYPE))
    })
  }

  const apiKindTransitionCases: ApiKindCase[] = [
    ['should apply BWC by default when no x-api-kind is set',                                      'none-to-none',   { [BREAKING_CHANGE_TYPE]: 1 }],
    ['should apply BWC when x-api-kind: BWC added in current document',                            'none-to-bwc',    { [BREAKING_CHANGE_TYPE]: 1, [UNCLASSIFIED_CHANGE_TYPE]: 1 }],
    ['should apply no-BWC when x-api-kind: no-BWC added in current document',                      'none-to-nobwc',  { [RISKY_CHANGE_TYPE]: 1, [UNCLASSIFIED_CHANGE_TYPE]: 1 }],
    ['should apply BWC when x-api-kind: BWC removed in current document',                          'bwc-to-none',    { [BREAKING_CHANGE_TYPE]: 1, [UNCLASSIFIED_CHANGE_TYPE]: 1 }],
    ['should apply BWC when x-api-kind: BWC in both documents',                                    'bwc-to-bwc',     { [BREAKING_CHANGE_TYPE]: 1 }],
    ['should apply no-BWC when x-api-kind changed from BWC to no-BWC',                             'bwc-to-nobwc',   { [RISKY_CHANGE_TYPE]: 1, [UNCLASSIFIED_CHANGE_TYPE]: 1 }],
    ['should apply no-BWC when x-api-kind: no-BWC in previous document and removed in current',    'nobwc-to-none',  { [RISKY_CHANGE_TYPE]: 1, [UNCLASSIFIED_CHANGE_TYPE]: 1 }],
    ['should apply no-BWC when x-api-kind changed from no-BWC to BWC',                             'nobwc-to-bwc',   { [RISKY_CHANGE_TYPE]: 1, [UNCLASSIFIED_CHANGE_TYPE]: 1 }],
    ['should apply no-BWC when x-api-kind: no-BWC in both documents',                              'nobwc-to-nobwc', { [RISKY_CHANGE_TYPE]: 1 }],
  ]

  describe('Operation-level x-api-kind', () => {
    runApiKindCases('operation', apiKindTransitionCases)
  })

  describe('Channel-level x-api-kind', () => {
    runApiKindCases('channel', apiKindTransitionCases)
  })

  describe('Operation + Channel x-api-kind', () => {
    test('should apply BWC from channel when operation has no x-api-kind', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changelog-apikind/operation/channel-bwc-operation-none')
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should apply no-BWC from channel when operation has no x-api-kind', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changelog-apikind/operation/channel-nobwc-operation-none')
      expect(result).toEqual(changesSummaryMatcher({ [RISKY_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [RISKY_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should prioritize operation no-BWC over channel BWC', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changelog-apikind/operation/channel-bwc-operation-nobwc')
      expect(result).toEqual(changesSummaryMatcher({ [RISKY_CHANGE_TYPE]: 1, [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [RISKY_CHANGE_TYPE]: 1, [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should prioritize operation BWC over channel no-BWC', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changelog-apikind/operation/channel-nobwc-operation-bwc')
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1, [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1, [UNCLASSIFIED_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })
  })

  describe('Remove operation tests', () => {
    test('should apply removed operation as BWC when operation has x-api-kind: BWC', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changelog-apikind/remove/remove-operation-bwc')
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should apply removed operation as no-BWC when operation has x-api-kind: no-BWC', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changelog-apikind/remove/remove-operation-nobwc')
      expect(result).toEqual(changesSummaryMatcher({ [RISKY_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [RISKY_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should apply removed operation as BWC by default when no x-api-kind is set', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changelog-apikind/remove/remove-operation-none')
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should prioritize removed operation BWC over channel no-BWC', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changelog-apikind/remove/remove-channel-nobwc-operation-bwc')
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should prioritize removed operation no-BWC over channel BWC', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changelog-apikind/remove/remove-channel-bwc-operation-nobwc')
      expect(result).toEqual(changesSummaryMatcher({ [RISKY_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [RISKY_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should fallback to channel no-BWC when removed operation has no x-api-kind', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changelog-apikind/remove/remove-channel-nobwc-operation-none')
      expect(result).toEqual(changesSummaryMatcher({ [RISKY_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [RISKY_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })

    test('should fallback to channel BWC when removed operation has no x-api-kind', async () => {
      const result = await buildChangelogPackageDefaultConfig('asyncapi-changelog-apikind/remove/remove-channel-bwc-operation-none')
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
      expect(result).toEqual(numberOfImpactedOperationsMatcher({ [BREAKING_CHANGE_TYPE]: 1 }, ASYNCAPI_API_TYPE))
    })
  })
})
