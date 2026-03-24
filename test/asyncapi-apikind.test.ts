import {
  API_KIND_SPECIFICATION_EXTENSION,
  APIHUB_API_COMPATIBILITY_KIND_BWC,
  APIHUB_API_COMPATIBILITY_KIND_NO_BWC,
  ApihubApiCompatibilityKind,
  ApiOperation,
} from '../src'
import { calculateAsyncApiKind } from '../src/apitypes/async/async.utils'
import { buildPackageWithDefaultConfig } from './helpers'
import { createAsyncApiCompatibilityScopeFunction } from '../src/components/compare/bwc.validation.async'
import {
  API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE,
  API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE,
} from '@netcracker/qubership-apihub-api-diff'

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
      const createChannel = (apiKind: string | undefined): {
        address: string
        [API_KIND_SPECIFICATION_EXTENSION]?: ApihubApiCompatibilityKind
      } => {
        return apiKind
          ? { address: 'channel1', [API_KIND_SPECIFICATION_EXTENSION]: apiKind as ApihubApiCompatibilityKind }
          : { address: 'channel1' }
      }

      const createOperation = (apiKind: string | undefined): {
        action: string
        channel: unknown
        [API_KIND_SPECIFICATION_EXTENSION]?: ApihubApiCompatibilityKind
      } => {
        return apiKind
          ? {
            action: 'receive',
            [API_KIND_SPECIFICATION_EXTENSION]: apiKind as ApihubApiCompatibilityKind,
            channel: {},
          }
          : { action: 'receive', channel: {} }
      }

      // short names
      const BWC = API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE
      const NOT_BWC = API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE

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
          // default | before | after | expected
          ['bwc', 'undefined', 'undefined', undefined],
          ['bwc', 'undefined', 'bwc', undefined],
          ['bwc', 'undefined', 'no-bwc', NOT_BWC],
          ['bwc', 'bwc', 'undefined', undefined],
          ['bwc', 'bwc', 'bwc', undefined],
          ['bwc', 'bwc', 'no-bwc', NOT_BWC],
          ['bwc', 'no-bwc', 'undefined', NOT_BWC],
          ['bwc', 'no-bwc', 'bwc', NOT_BWC],
          ['bwc', 'no-bwc', 'no-bwc', NOT_BWC],
          ['no-bwc', 'undefined', 'undefined', undefined],
          ['no-bwc', 'undefined', 'bwc', undefined],
          ['no-bwc', 'undefined', 'no-bwc', NOT_BWC],
          ['no-bwc', 'bwc', 'undefined', undefined],
          ['no-bwc', 'bwc', 'bwc', undefined],
          ['no-bwc', 'bwc', 'no-bwc', NOT_BWC],
          ['no-bwc', 'no-bwc', 'undefined', NOT_BWC],
          ['no-bwc', 'no-bwc', 'bwc', NOT_BWC],
          ['no-bwc', 'no-bwc', 'no-bwc', NOT_BWC],
        ] as const)('documentApiKind: %s, before: %s, after: %s', (
          documentApiKind,
          beforeKind,
          afterKind,
          expected,
        ) => {
          const scopeFunction = createAsyncApiCompatibilityScopeFunction(documentApiKind)
          expect(scopeFunction(['channels', 'ch1'], createChannel(beforeKind), createChannel(afterKind))).toBe(expected)
        })
      })

      describe('Operations scope', () => {
        it.each([
          // default | before | after | expected
          ['bwc', 'undefined', 'undefined', undefined],
          ['bwc', 'undefined', 'bwc', undefined],
          ['bwc', 'undefined', 'no-bwc', NOT_BWC],
          ['bwc', 'bwc', 'undefined', undefined],
          ['bwc', 'bwc', 'bwc', undefined],
          ['bwc', 'bwc', 'no-bwc', NOT_BWC],
          ['bwc', 'no-bwc', 'undefined', NOT_BWC],
          ['bwc', 'no-bwc', 'bwc', NOT_BWC],
          ['bwc', 'no-bwc', 'no-bwc', NOT_BWC],
          ['no-bwc', 'undefined', 'undefined', undefined],
          ['no-bwc', 'undefined', 'bwc', undefined],
          ['no-bwc', 'undefined', 'no-bwc', NOT_BWC],
          ['no-bwc', 'bwc', 'undefined', undefined],
          ['no-bwc', 'bwc', 'bwc', undefined],
          ['no-bwc', 'bwc', 'no-bwc', NOT_BWC],
          ['no-bwc', 'no-bwc', 'undefined', NOT_BWC],
          ['no-bwc', 'no-bwc', 'bwc', NOT_BWC],
          ['no-bwc', 'no-bwc', 'no-bwc', NOT_BWC],
        ] as const)('documentApiKind: %s, before: %s, after: %s', (
          documentApiKind,
          beforeKind,
          afterKind,
          expected,
        ) => {
          const scopeFunction = createAsyncApiCompatibilityScopeFunction(documentApiKind)
          expect(scopeFunction(['operations', 'op1'], createOperation(beforeKind), createOperation(afterKind))).toBe(expected)
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
          expect(scopeFunction(['operations', 'op1'], before, after)).toBeUndefined()
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
