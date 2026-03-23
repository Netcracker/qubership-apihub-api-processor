import {
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
      const scopeFunction = createAsyncApiCompatibilityScopeFunction()

      describe('Root level', () => {
        it('should return BWC for root path', () => {
          expect(scopeFunction([], {}, {})).toBe(API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE)
        })

        it('should return BWC for undefined path', () => {
          expect(scopeFunction(undefined, {}, {})).toBe(API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE)
        })
      })

      describe('Channels scope', () => {
        it('should return BWC when channel has no x-api-kind', () => {
          const before = { address: 'channel1' }
          const after = { address: 'channel1' }
          expect(scopeFunction(['channels', 'ch1'], before, after)).toBe(API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE)
        })

        it('should return no-BWC when before channel has x-api-kind no-BWC', () => {
          const before = { address: 'channel1', 'x-api-kind': 'no-BWC' }
          const after = { address: 'channel1' }
          expect(scopeFunction(['channels', 'ch1'], before, after)).toBe(API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE)
        })

        it('should return no-BWC when after channel has x-api-kind no-BWC', () => {
          const before = { address: 'channel1' }
          const after = { address: 'channel1', 'x-api-kind': 'no-BWC' }
          expect(scopeFunction(['channels', 'ch1'], before, after)).toBe(API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE)
        })

        it('should return no-BWC when before channel BWC and after channel no-BWC', () => {
          const before = { address: 'channel1', 'x-api-kind': 'BWC'}
          const after = { address: 'channel1', 'x-api-kind': 'no-BWC' }
          expect(scopeFunction(['channels', 'ch1'], before, after)).toBe(API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE)
        })

        it('should return no-BWC when before channel no-BWC and after channel BWC', () => {
          const before = { address: 'channel1', 'x-api-kind': 'no-BWC'}
          const after = { address: 'channel1',  'x-api-kind': 'BWC'}
          expect(scopeFunction(['channels', 'ch1'], before, after)).toBe(API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE)
        })

        it('should return BWC when both channels have x-api-kind BWC', () => {
          const before = { address: 'channel1', 'x-api-kind': 'BWC'}
          const after = { address: 'channel1',  'x-api-kind': 'BWC'}
          expect(scopeFunction(['channels', 'ch1'], before, after)).toBe(API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE)
        })

        it('should return no-BWC when both channels have x-api-kind no-BWC', () => {
          const before = { address: 'channel1', 'x-api-kind': 'no-BWC'}
          const after = { address: 'channel1',  'x-api-kind': 'no-BWC'}
          expect(scopeFunction(['channels', 'ch1'], before, after)).toBe(API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE)
        })
      })

      describe('Operations scope', () => {
        it('should return BWC when operation and channel have no x-api-kind', () => {
          const before = { action: 'receive', channel: {} }
          const after = { action: 'receive', channel: {} }
          expect(scopeFunction(['operations', 'op1'], before, after)).toBe(API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE)
        })

        it('should return no-BWC when before operation channel has x-api-kind no-BWC', () => {
          const before = { action: 'receive', channel: { 'x-api-kind': 'no-BWC' } }
          const after = { action: 'receive', channel: {} }
          expect(scopeFunction(['operations', 'op1'], before, after)).toBe(API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE)
        })

        it('should return no-BWC when after operation channel has x-api-kind no-BWC', () => {
          const before = { action: 'receive', channel: {} }
          const after = { action: 'receive', channel: { 'x-api-kind': 'no-BWC' } }
          expect(scopeFunction(['operations', 'op1'], before, after)).toBe(API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE)
        })

        it('should return no-BWC when before operation has x-api-kind no-BWC', () => {
          const before = { action: 'receive', 'x-api-kind': 'no-BWC', channel: {} }
          const after = { action: 'receive', channel: {} }
          expect(scopeFunction(['operations', 'op1'], before, after)).toBe(API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE)
        })

        it('should return no-BWC when after operation has x-api-kind no-BWC', () => {
          const before = { action: 'receive', channel: {} }
          const after = { action: 'receive', 'x-api-kind': 'no-BWC', channel: {} }
          expect(scopeFunction(['operations', 'op1'], before, after)).toBe(API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE)
        })

        it('should return BWC when operation x-api-kind BWC overrides channel x-api-kind no-BWC', () => {
          const before = { action: 'receive', 'x-api-kind': 'BWC', channel: { 'x-api-kind': 'no-BWC' } }
          const after = { action: 'receive', 'x-api-kind': 'BWC', channel: { 'x-api-kind': 'no-BWC' } }
          expect(scopeFunction(['operations', 'op1'], before, after)).toBe(API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE)
        })

        it('should return no-BWC when operation x-api-kind no-BWC overrides channel x-api-kind BWC', () => {
          const before = { action: 'receive', 'x-api-kind': 'no-BWC', channel: { 'x-api-kind': 'BWC' } }
          const after = { action: 'receive', 'x-api-kind': 'no-BWC', channel: { 'x-api-kind': 'BWC' } }
          expect(scopeFunction(['operations', 'op1'], before, after)).toBe(API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE)
        })

        it('should return BWC when removed operation has no x-api-kind', () => {
          const before = { action: 'receive', channel: {} }
          expect(scopeFunction(['operations', 'op1'], before, undefined)).toBe(API_COMPATIBILITY_KIND_BACKWARD_COMPATIBLE)
        })

        it('should return no-BWC when removed operation has x-api-kind no-BWC', () => {
          const before = { action: 'receive', 'x-api-kind': 'no-BWC', channel: {} }
          expect(scopeFunction(['operations', 'op1'], before, undefined)).toBe(API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE)
        })

        it('should return no-BWC when removed operation channel has x-api-kind no-BWC', () => {
          const before = { action: 'receive', channel: { 'x-api-kind': 'no-BWC' } }
          expect(scopeFunction(['operations', 'op1'], before, undefined)).toBe(API_COMPATIBILITY_KIND_NOT_BACKWARD_COMPATIBLE)
        })
      })

      describe('Other paths', () => {
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
    let operation: ApiOperation
    let operationWithChannelBwc: ApiOperation
    let operationWithChannelNoBwc: ApiOperation
    let operationBwc: ApiOperation
    let operationNoBwc: ApiOperation
    let operationBwcWithChannelBwc: ApiOperation
    let operationBwcWithChannelNoBwc: ApiOperation
    let operationNoBwcWithChannelBwc: ApiOperation
    let operationNoBwcWithChannelNoBwc: ApiOperation

    beforeAll(async () => {
      const result = await buildPackageWithDefaultConfig('asyncapi/api-kind/base')
      ;[
        operation,
        operationWithChannelBwc,
        operationWithChannelNoBwc,
        operationBwc,
        operationNoBwc,
        operationBwcWithChannelBwc,
        operationBwcWithChannelNoBwc,
        operationNoBwcWithChannelBwc,
        operationNoBwcWithChannelNoBwc,
      ] = Array.from(result.operations.values())
    })

    it('should apply BWC apiKind when both operation and channel have no apiKind', () => {
      expect(operation.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    })

    it('should apply BWC apiKind when channel apiKind is BWC and operation has no apiKind', () => {
      expect(operationWithChannelBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    })

    it('should apply NO_BWC apiKind when channel apiKind is NO_BWC and operation has no apiKind', () => {
      expect(operationWithChannelNoBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_NO_BWC)
    })

    it('should apply BWC apiKind when operation apiKind is BWC and channel has no apiKind', () => {
      expect(operationBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    })

    it('should apply NO_BWC apiKind when operation apiKind is NO_BWC and channel has no apiKind', () => {
      expect(operationNoBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_NO_BWC)
    })

    it('should apply BWC apiKind when both operation and channel apiKind are BWC', () => {
      expect(operationBwcWithChannelBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    })

    it('should apply BWC apiKind when operation apiKind is BWC and channel apiKind is NO_BWC', () => {
      expect(operationBwcWithChannelNoBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_BWC)
    })

    it('should apply NO_BWC apiKind when operation apiKind is NO_BWC and channel apiKind is BWC', () => {
      expect(operationNoBwcWithChannelBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_NO_BWC)
    })

    it('should apply NO_BWC apiKind when both operation and channel apiKind are NO_BWC', () => {
      expect(operationNoBwcWithChannelNoBwc.apiKind).toEqual(APIHUB_API_COMPATIBILITY_KIND_NO_BWC)
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
