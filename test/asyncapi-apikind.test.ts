import {
  API_KIND_SPECIFICATION_EXTENSION,
  APIHUB_API_COMPATIBILITY_KIND_BWC,
  APIHUB_API_COMPATIBILITY_KIND_NO_BWC,
  ApihubApiCompatibilityKind,
  ApiOperation,
} from '../src'
import { calculateAsyncApiKind } from '../src/apitypes/async/async.utils'
import { buildPackageWithDefaultConfig } from './helpers'
import { createAsyncApiCompatibilityScopeFunction } from '../src/components/compare/async.bwc.validation'
import {
  API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE,
  API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE,
} from '@netcracker/qubership-apihub-api-diff'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/esm/spec-types'

describe('AsyncAPI apiKind calculation', () => {
  describe('Unit tests', () => {
    it('should resolve effective apiKind from operation and channel x-api-kind', () => {
      const data = [
        // Operation ApiKind, Channel ApiKnd, Result
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

    describe('Changelog backward compatibility scope function', () => {
      // short names
      const BWC = API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE
      const NOT_BWC = API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE

      // Factories return a fresh object each time so that before/after are distinct instances.
      // Currently the scope function only reads properties and doesn't compare by reference,
      // but unique instances prevent false positives if the implementation ever starts
      // distinguishing "same object" from "equal objects" (e.g. identity checks or mutation).
      const channel = (): AsyncAPIV3.ChannelObject => ({ address: 'channel1' })
      const bwcChannel = (): AsyncAPIV3.ChannelObject => ({ ...channel(), [API_KIND_SPECIFICATION_EXTENSION]: APIHUB_API_COMPATIBILITY_KIND_BWC })
      const noBwcChannel = (): AsyncAPIV3.ChannelObject => ({ ...channel(), [API_KIND_SPECIFICATION_EXTENSION]: APIHUB_API_COMPATIBILITY_KIND_NO_BWC })

      const operation = (): AsyncAPIV3.OperationObject => ({ action: 'receive', channel: {} })
      const bwcOperation = (): AsyncAPIV3.OperationObject => ({ ...operation(), [API_KIND_SPECIFICATION_EXTENSION]: APIHUB_API_COMPATIBILITY_KIND_BWC })
      const noBwcOperation = (): AsyncAPIV3.OperationObject => ({ ...operation(), [API_KIND_SPECIFICATION_EXTENSION]: APIHUB_API_COMPATIBILITY_KIND_NO_BWC })

      describe('Root level', () => {
        it.each([
          // prev    | curr    | expected
          ['bwc',     'bwc',    BWC],
          ['bwc',     'no-bwc', NOT_BWC],
          ['no-bwc',  'bwc',    NOT_BWC],
          ['no-bwc',  'no-bwc', NOT_BWC],
        ])('prev: %s, curr: %s → should return %s', (prev, curr, expected) => {
          const scopeFunction = createAsyncApiCompatibilityScopeFunction(
            prev as ApihubApiCompatibilityKind,
            curr as ApihubApiCompatibilityKind,
          )
          expect(scopeFunction([], {}, {})).toBe(expected)
        })
      })

      describe('Channels scope', () => {
        it.each([
          // default        | before           | after            | expected
          // undefined JSO = channel added/removed
          ['bwc', channel(), channel(), BWC],
          ['bwc', channel(), bwcChannel(), BWC],
          ['bwc', channel(), noBwcChannel(), NOT_BWC],
          ['bwc', bwcChannel(), channel(), BWC],
          ['bwc', bwcChannel(), bwcChannel(), BWC],
          ['bwc', bwcChannel(), noBwcChannel(), NOT_BWC],
          ['bwc', noBwcChannel(), channel(), NOT_BWC],
          ['bwc', noBwcChannel(), bwcChannel(), NOT_BWC],
          ['bwc', noBwcChannel(), noBwcChannel(), NOT_BWC],
          ['bwc', undefined, channel(), BWC],
          ['bwc', undefined, noBwcChannel(), NOT_BWC],
          ['bwc', channel(), undefined, BWC],
          ['bwc', noBwcChannel(), undefined, NOT_BWC],
          ['bwc', undefined, undefined, undefined],
          ['no-bwc', channel(), channel(), BWC],
          ['no-bwc', channel(), bwcChannel(), BWC],
          ['no-bwc', channel(), noBwcChannel(), NOT_BWC],
          ['no-bwc', bwcChannel(), channel(), BWC],
          ['no-bwc', bwcChannel(), bwcChannel(), BWC],
          ['no-bwc', bwcChannel(), noBwcChannel(), NOT_BWC],
          ['no-bwc', noBwcChannel(), channel(), NOT_BWC],
          ['no-bwc', noBwcChannel(), bwcChannel(), NOT_BWC],
          ['no-bwc', noBwcChannel(), noBwcChannel(), NOT_BWC],
          ['no-bwc', undefined, channel(), BWC],
          ['no-bwc', undefined, noBwcChannel(), NOT_BWC],
          ['no-bwc', channel(), undefined, BWC],
          ['no-bwc', noBwcChannel(), undefined, NOT_BWC],
          ['no-bwc', undefined, undefined, undefined],
        ] as const)('documentApiKind: %s, before: %s, after: %s', (
          documentApiKind,
          beforeJso,
          afterJso,
          expected,
        ) => {
          const scopeFunction = createAsyncApiCompatibilityScopeFunction(documentApiKind)
          expect(scopeFunction(['channels', 'ch1'], beforeJso, afterJso)).toBe(expected)
        })
      })

      describe('Operations scope', () => {
        it.each([
          // default        | before              | after               | expected
          ['bwc', operation(), operation(), BWC],
          ['bwc', operation(), bwcOperation(), BWC],
          ['bwc', operation(), noBwcOperation(), NOT_BWC],
          ['bwc', bwcOperation(), operation(), BWC],
          ['bwc', bwcOperation(), bwcOperation(), BWC],
          ['bwc', bwcOperation(), noBwcOperation(), NOT_BWC],
          ['bwc', noBwcOperation(), operation(), NOT_BWC],
          ['bwc', noBwcOperation(), bwcOperation(), NOT_BWC],
          ['bwc', noBwcOperation(), noBwcOperation(), NOT_BWC],
          ['bwc', undefined, operation(), BWC],
          ['bwc', undefined, noBwcOperation(), NOT_BWC],
          ['bwc', operation(), undefined, BWC],
          ['bwc', noBwcOperation(), undefined, NOT_BWC],
          ['bwc', undefined, undefined, undefined],
          ['no-bwc', operation(), operation(), BWC],
          ['no-bwc', operation(), bwcOperation(), BWC],
          ['no-bwc', operation(), noBwcOperation(), NOT_BWC],
          ['no-bwc', bwcOperation(), operation(), BWC],
          ['no-bwc', bwcOperation(), bwcOperation(), BWC],
          ['no-bwc', bwcOperation(), noBwcOperation(), NOT_BWC],
          ['no-bwc', noBwcOperation(), operation(), NOT_BWC],
          ['no-bwc', noBwcOperation(), bwcOperation(), NOT_BWC],
          ['no-bwc', noBwcOperation(), noBwcOperation(), NOT_BWC],
          ['no-bwc', undefined, operation(), BWC],
          ['no-bwc', undefined, noBwcOperation(), NOT_BWC],
          ['no-bwc', operation(), undefined, BWC],
          ['no-bwc', noBwcOperation(), undefined, NOT_BWC],
          ['no-bwc', undefined, undefined, undefined],
        ] as const)('documentApiKind: %s, before: %s, after: %s', (
          documentApiKind,
          beforeJso,
          afterJso,
          expected,
        ) => {
          const scopeFunction = createAsyncApiCompatibilityScopeFunction(documentApiKind)
          expect(scopeFunction(['operations', 'op1'], beforeJso, afterJso)).toBe(expected)
        })

        it('should use channel x-api-kind as fallback when operation has no x-api-kind', () => {
          const scopeFunction = createAsyncApiCompatibilityScopeFunction()
          const before = {
            action: 'receive',
            channel: { [API_KIND_SPECIFICATION_EXTENSION]: APIHUB_API_COMPATIBILITY_KIND_NO_BWC },
          }
          const after = { action: 'receive', channel: {} }
          expect(scopeFunction(['operations', 'op1'], before, after)).toBe(NOT_BWC)
        })

        it('should let operation x-api-kind override channel x-api-kind', () => {
          const scopeFunction = createAsyncApiCompatibilityScopeFunction()
          const before = {
            action: 'receive',
            [API_KIND_SPECIFICATION_EXTENSION]: APIHUB_API_COMPATIBILITY_KIND_BWC,
            channel: { [API_KIND_SPECIFICATION_EXTENSION]: APIHUB_API_COMPATIBILITY_KIND_NO_BWC },
          }
          const after = {
            action: 'receive',
            [API_KIND_SPECIFICATION_EXTENSION]: APIHUB_API_COMPATIBILITY_KIND_BWC,
            channel: { [API_KIND_SPECIFICATION_EXTENSION]: APIHUB_API_COMPATIBILITY_KIND_NO_BWC },
          }
          expect(scopeFunction(['operations', 'op1'], before, after)).toBe(BWC)
        })
      })

      describe('Other paths', () => {
        const scopeFunction = createAsyncApiCompatibilityScopeFunction()

        it('should return undefined for non-operations/non-channels paths', () => {
          expect(scopeFunction(['components', 'messages'], {}, {})).toBeUndefined()
        })

        it('should return undefined for deeper operation paths', () => {
          expect(scopeFunction(['operations', 'op1', 'channel'], {}, {})).toBeUndefined()
        })

        it('should return undefined for deeper channel paths', () => {
          expect(scopeFunction(['channels', 'ch1', 'messages'], {}, {})).toBeUndefined()
        })
      })
    })
  })

  describe('AsyncAPI operation/channel compatibility apiKind application', () => {
    let operationNoKindChannelNoKind: ApiOperation
    let operationNoKindChannelBWC: ApiOperation
    let operationNoKindChannelNoBWC: ApiOperation
    let operationBWCChannelNoKind: ApiOperation
    let operationNoBWCChannelNoKind: ApiOperation
    let operationBWCChannelBWC: ApiOperation
    let operationBWCChannelNoBWC: ApiOperation
    let operationNoBWCChannelBWC: ApiOperation
    let operationNoBWCChannelNoBWC: ApiOperation

    beforeAll(async () => {
      const result = await buildPackageWithDefaultConfig('asyncapi/api-kind/base')
      ;[
        operationNoKindChannelNoKind,
        operationNoKindChannelBWC,
        operationNoKindChannelNoBWC,
        operationBWCChannelNoKind,
        operationNoBWCChannelNoKind,
        operationBWCChannelBWC,
        operationBWCChannelNoBWC,
        operationNoBWCChannelBWC,
        operationNoBWCChannelNoBWC,
      ] = Array.from(result.operations.values())
    })

    it('operationNoKindChannelNoKind → BWC', () => {
      expect(operationNoKindChannelNoKind.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    })

    it('operationNoKindChannelBWC → BWC', () => {
      expect(operationNoKindChannelBWC.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    })

    it('operationNoKindChannelNoBWC → NoBWC', () => {
      expect(operationNoKindChannelNoBWC.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_NO_BWC)
    })

    it('operationBWCChannelNoKind → BWC', () => {
      expect(operationBWCChannelNoKind.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    })

    it('operationNoBWCChannelNoKind → NoBWC', () => {
      expect(operationNoBWCChannelNoKind.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_NO_BWC)
    })

    it('operationBWCChannelBWC → BWC', () => {
      expect(operationBWCChannelBWC.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    })

    it('operationBWCChannelNoBWC → BWC', () => {
      expect(operationBWCChannelNoBWC.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    })

    it('operationNoBWCChannelBWC → NoBWC', () => {
      expect(operationNoBWCChannelBWC.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_NO_BWC)
    })

    it('operationNoBWCChannelNoBWC → NoBWC', () => {
      expect(operationNoBWCChannelNoBWC.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_NO_BWC)
    })
  })

  it('should apply channel apiKind to all operations using that channel', async () => {
    const result = await buildPackageWithDefaultConfig('asyncapi/api-kind/share-channel-api-kind')
    const operations = Array.from(result.operations.values())

    expect(operations.every(operation => operation.apiKind === APIHUB_API_COMPATIBILITY_KIND_NO_BWC)).toBeTrue()
  })

  describe('Labels should not redefine AsyncAPI apiKind', () => {
    it('should not override default BWC apiKind with no-BWC label', async () => {
      const result = await buildPackageWithDefaultConfig('asyncapi/api-kind/base', ['apihub/x-api-kind: no-BWC'])
      const operations = Array.from(result.operations.values())
      // First operation has no x-api-kind on operation or channel — should stay BWC despite label
      expect(operations[0].apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    })

    it('should not override channel NO_BWC apiKind with BWC label', async () => {
      const result = await buildPackageWithDefaultConfig('asyncapi/api-kind/base', ['apihub/x-api-kind: BWC'])
      const operations = Array.from(result.operations.values())
      // Third operation uses channel-no-bwc — should stay NO_BWC despite BWC label
      expect(operations[2].apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_NO_BWC)
    })
  })
})
