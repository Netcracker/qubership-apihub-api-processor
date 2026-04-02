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
      const BWC = APIHUB_API_COMPATIBILITY_KIND_BWC
      const NO_BWC = APIHUB_API_COMPATIBILITY_KIND_NO_BWC

      const BACKWARD_COMPATIBLE = API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE
      const NOT_BACKWARD_COMPATIBLE = API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE

      // null = object absent (added/removed), undefined = object exists without x-api-kind
      type ApiKindInput = ApihubApiCompatibilityKind | undefined | null

      const buildChannel = (kind: ApiKindInput): AsyncAPIV3.ChannelObject | undefined => {
        if (kind === null) { return undefined }
        const channel: AsyncAPIV3.ChannelObject = { address: 'channel1' }
        if (kind !== undefined) { channel[API_KIND_SPECIFICATION_EXTENSION] = kind }
        return channel
      }

      const buildOperation = (kind: ApiKindInput): AsyncAPIV3.OperationObject | undefined => {
        if (kind === null) { return undefined }
        const operation: AsyncAPIV3.OperationObject = { action: 'send', channel: {} }
        if (kind !== undefined) { operation[API_KIND_SPECIFICATION_EXTENSION] = kind }
        return operation
      }

      describe('Root level', () => {
        it.each([
          // prev    | curr    | expected
          [BWC,      BWC,      BACKWARD_COMPATIBLE],
          [BWC,      NO_BWC,   NOT_BACKWARD_COMPATIBLE],
          [NO_BWC,   BWC,      NOT_BACKWARD_COMPATIBLE],
          [NO_BWC,   NO_BWC,   NOT_BACKWARD_COMPATIBLE],
        ] as const)('should classify root scope prev(%s) curr(%s) as %s', (prev, curr, expected) => {
          const scopeFunction = createAsyncApiCompatibilityScopeFunction(prev, curr)
          expect(scopeFunction([], {}, {})).toBe(expected)
        })
      })

      describe('Channels scope', () => {
        it.each([
          // document | before    | after     | expected
          // null = channel added/removed
          [BWC, undefined, undefined, BACKWARD_COMPATIBLE],
          [BWC, undefined, BWC,       BACKWARD_COMPATIBLE],
          [BWC, undefined, NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          [BWC, BWC,       undefined, BACKWARD_COMPATIBLE],
          [BWC, BWC,       BWC,       BACKWARD_COMPATIBLE],
          [BWC, BWC,       NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          [BWC, NO_BWC,    undefined, NOT_BACKWARD_COMPATIBLE],
          [BWC, NO_BWC,    BWC,       NOT_BACKWARD_COMPATIBLE],
          [BWC, NO_BWC,    NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          [BWC, null,      undefined, BACKWARD_COMPATIBLE],
          [BWC, null,      NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          [BWC, undefined, null,      BACKWARD_COMPATIBLE],
          [BWC, NO_BWC,    null,      NOT_BACKWARD_COMPATIBLE],
          // Unrealistic: diff engine never calls scope for a path absent in both versions. Defensive guard.
          [BWC, null,      null,      undefined],

          [NO_BWC, undefined, undefined, BACKWARD_COMPATIBLE],
          [NO_BWC, undefined, BWC,       BACKWARD_COMPATIBLE],
          [NO_BWC, undefined, NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, BWC,       undefined, BACKWARD_COMPATIBLE],
          [NO_BWC, BWC,       BWC,       BACKWARD_COMPATIBLE],
          [NO_BWC, BWC,       NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, NO_BWC,    undefined, NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, NO_BWC,    BWC,       NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, NO_BWC,    NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, null,      undefined, BACKWARD_COMPATIBLE],
          [NO_BWC, null,      NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, undefined, null,      BACKWARD_COMPATIBLE],
          [NO_BWC, NO_BWC,    null,      NOT_BACKWARD_COMPATIBLE],
          // Unrealistic: diff engine never calls scope for a path absent in both versions. Defensive guard.
          [NO_BWC, null,      null,      undefined],
        ] as const)('should classify channel scope document(%s) before(%s) after(%s) as %s', (
          documentApiKind,
          beforeKind,
          afterKind,
          expected,
        ) => {
          const scopeFunction = createAsyncApiCompatibilityScopeFunction(documentApiKind, documentApiKind)
          expect(scopeFunction(['channels', 'ch1'], buildChannel(beforeKind), buildChannel(afterKind))).toBe(expected)
        })
      })

      describe('Operations scope', () => {
        it.each([
          // document | before    | after     | expected
          // null = operation added/removed
          [BWC, undefined, undefined, BACKWARD_COMPATIBLE],
          [BWC, undefined, BWC,       BACKWARD_COMPATIBLE],
          [BWC, undefined, NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          [BWC, undefined, null,      BACKWARD_COMPATIBLE],
          [BWC, BWC,       undefined, BACKWARD_COMPATIBLE],
          [BWC, BWC,       BWC,       BACKWARD_COMPATIBLE],
          [BWC, BWC,       NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          [BWC, BWC,       null,      BACKWARD_COMPATIBLE],
          [BWC, NO_BWC,    undefined, NOT_BACKWARD_COMPATIBLE],
          [BWC, NO_BWC,    BWC,       NOT_BACKWARD_COMPATIBLE],
          [BWC, NO_BWC,    NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          [BWC, NO_BWC,    null,      NOT_BACKWARD_COMPATIBLE],
          [BWC, null,      undefined, BACKWARD_COMPATIBLE],
          [BWC, null,      BWC,       BACKWARD_COMPATIBLE],
          [BWC, null,      NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          // Unrealistic: diff engine never calls scope for a path absent in both versions. Defensive guard.
          [BWC, null,      null,      undefined],

          [NO_BWC, undefined, undefined, NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, undefined, BWC,       NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, undefined, NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, undefined, null,      NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, BWC,       undefined, NOT_BACKWARD_COMPATIBLE], //BACKWARD_COMPATIBLE
          [NO_BWC, BWC,       BWC,       BACKWARD_COMPATIBLE],
          [NO_BWC, BWC,       NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, BWC,       null,      NOT_BACKWARD_COMPATIBLE],//BACKWARD_COMPATIBLE
          [NO_BWC, NO_BWC,    undefined, NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, NO_BWC,    BWC,       NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, NO_BWC,    NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, NO_BWC,    null,      NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, null,      undefined, NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, null,      BWC,       NOT_BACKWARD_COMPATIBLE],
          [NO_BWC, null,      NO_BWC,    NOT_BACKWARD_COMPATIBLE],
          // Unrealistic: diff engine never calls scope for a path absent in both versions. Defensive guard.
          [NO_BWC, null,      null,      undefined],
        ] as const)('should classify operation scope document(%s) before(%s) after(%s) as %s', (
          documentApiKind,
          beforeKind,
          afterKind,
          expected,
        ) => {
          const scopeFunction = createAsyncApiCompatibilityScopeFunction(documentApiKind, documentApiKind)
          expect(scopeFunction(['operations', 'op1'], buildOperation(beforeKind), buildOperation(afterKind))).toBe(expected)
        })

        it('should use channel x-api-kind as fallback when operation has no x-api-kind', () => {
          const scopeFunction = createAsyncApiCompatibilityScopeFunction()
          const before = {
            action: 'send' as const,
            channel: { [API_KIND_SPECIFICATION_EXTENSION]: NO_BWC },
          }
          const after = { action: 'send' as const, channel: {} }
          expect(scopeFunction(['operations', 'op1'], before, after)).toBe(NOT_BACKWARD_COMPATIBLE)
        })

        it('should let operation x-api-kind override channel x-api-kind', () => {
          const scopeFunction = createAsyncApiCompatibilityScopeFunction()
          const before = {
            action: 'send' as const,
            [API_KIND_SPECIFICATION_EXTENSION]: BWC,
            channel: { [API_KIND_SPECIFICATION_EXTENSION]: NO_BWC },
          }
          const after = {
            action: 'send' as const,
            [API_KIND_SPECIFICATION_EXTENSION]: BWC,
            channel: { [API_KIND_SPECIFICATION_EXTENSION]: NO_BWC },
          }
          expect(scopeFunction(['operations', 'op1'], before, after)).toBe(BACKWARD_COMPATIBLE)
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
