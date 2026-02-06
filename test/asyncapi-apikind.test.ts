import {
  APIHUB_API_COMPATIBILITY_KIND_BWC,
  APIHUB_API_COMPATIBILITY_KIND_NO_BWC,
  ApihubApiCompatibilityKind,
} from '../src'
import { calculateAsyncApiKind } from '../src/apitypes/async/async.utils'
import { buildPackage } from './helpers'

describe('apiKind', () => {
  it('unit unique values', () => {
    const data = [
      [undefined, undefined, APIHUB_API_COMPATIBILITY_KIND_BWC],
      [APIHUB_API_COMPATIBILITY_KIND_BWC, undefined, APIHUB_API_COMPATIBILITY_KIND_BWC],
      [undefined, APIHUB_API_COMPATIBILITY_KIND_BWC, APIHUB_API_COMPATIBILITY_KIND_BWC],
      [APIHUB_API_COMPATIBILITY_KIND_NO_BWC, undefined, APIHUB_API_COMPATIBILITY_KIND_NO_BWC],
      [undefined, APIHUB_API_COMPATIBILITY_KIND_NO_BWC, APIHUB_API_COMPATIBILITY_KIND_NO_BWC],
      [APIHUB_API_COMPATIBILITY_KIND_BWC, APIHUB_API_COMPATIBILITY_KIND_NO_BWC, APIHUB_API_COMPATIBILITY_KIND_BWC],
      [APIHUB_API_COMPATIBILITY_KIND_NO_BWC, APIHUB_API_COMPATIBILITY_KIND_BWC, APIHUB_API_COMPATIBILITY_KIND_NO_BWC],
    ]
    data.forEach(([operationApiKind, channelApiKind, expected]) => {
      const result = calculateAsyncApiKind(operationApiKind as ApihubApiCompatibilityKind, channelApiKind as ApihubApiCompatibilityKind)
      expect(result).toBe(expected)
    })
  })

  it('e2e', async () => {
    const result = await buildPackage('asyncapi/api-kind/base')
    const operations = Array.from(result.operations.values())

    const [
      operation,
      operationWithCannelBwc,
      operationWithCannelNoBwc,
      operationBwc,
      operationNoBwc,
      operationBwcWithChannelBwc,
      operationBwcWithChannelNoBwc,
      operationNoBwcWithChannelBwc,
      operationNoBwcWithChannelNoBwc,
    ] = operations
    expect(operation.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    expect(operationWithCannelBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    expect(operationWithCannelNoBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_NO_BWC)
    expect(operationBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    expect(operationNoBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_NO_BWC)
    expect(operationBwcWithChannelBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    expect(operationBwcWithChannelNoBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    expect(operationNoBwcWithChannelBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_NO_BWC)
    expect(operationNoBwcWithChannelNoBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_NO_BWC)
  })
})
