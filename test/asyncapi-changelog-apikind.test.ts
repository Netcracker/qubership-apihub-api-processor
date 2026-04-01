import {
  buildChangelogFromContent,
  changesSummaryMatcher,
  generateAsyncApiSpec,
  generateAsyncApiTwoOperationsSpec,
  generateAsyncApiTwoChannelsSpec,
} from './helpers'
import type { ApiKindValue } from './helpers'
import { ASYNCAPI_API_TYPE, BREAKING_CHANGE_TYPE, RISKY_CHANGE_TYPE, UNCLASSIFIED_CHANGE_TYPE } from '../src'

type ChangeType = 'breaking' | 'risky'

const breaking: ChangeType = 'breaking'
const risky: ChangeType = 'risky'

function buildExpected(type: ChangeType, unclassified: number): Record<string, number> {
  const changeType = type === 'breaking' ? BREAKING_CHANGE_TYPE : RISKY_CHANGE_TYPE
  return {
    [changeType]: 1,
    ...(unclassified > 0 && { [UNCLASSIFIED_CHANGE_TYPE]: unclassified }),
  }
}

describe('AsyncAPI changelog api-kind tests', () => {
  describe('Remove operation tests (all x-api-kind combinations)', () => {

    // [beforeCh, beforeOp, afterCh, expectedType, unclassified]
    // unclassified — number of UNCLASSIFIED changes caused by x-api-kind property itself being added/removed/changed
    type RemoveOpCase = [ApiKindValue, ApiKindValue, ApiKindValue, ChangeType, number]

    const removeOperationCases: RemoveOpCase[] = [
      // beforeCh=none
      ['undefined',     'undefined',      'undefined',      breaking, 0],
      ['undefined',     'undefined',      'BWC',            breaking, 1],
      ['undefined',     'undefined',      'no-BWC',         breaking, 1],
      ['undefined',     'BWC',            'undefined',      breaking, 0],
      ['undefined',     'BWC',            'BWC',            breaking, 1],
      ['undefined',     'BWC',            'no-BWC',         breaking, 1],
      ['undefined',     'no-BWC',         'undefined',      risky, 0],
      ['undefined',     'no-BWC',         'BWC',            risky, 1],
      ['undefined',     'no-BWC',         'no-BWC',         risky, 1],
      // beforeCh=BWC
      ['BWC',     'undefined',      'undefined',      breaking, 1],
      ['BWC',     'undefined',      'BWC',            breaking, 0],
      ['BWC',     'undefined',      'no-BWC',         breaking, 1],
      ['BWC',     'BWC',            'undefined',      breaking, 1],
      ['BWC',     'BWC',            'BWC',            breaking, 0],
      ['BWC',     'BWC',            'no-BWC',         breaking, 1],
      ['BWC',     'no-BWC',         'undefined',      risky, 1],
      ['BWC',     'no-BWC',         'BWC',            risky, 0],
      ['BWC',     'no-BWC',         'no-BWC',         risky, 1],
      // beforeCh=no-BWC
      ['no-BWC',      'undefined',      'undefined',      risky, 1],
      ['no-BWC',      'undefined',      'BWC',            risky, 1],
      ['no-BWC',      'undefined',      'no-BWC',         risky, 0],
      ['no-BWC',      'BWC',            'undefined',      breaking, 1],
      ['no-BWC',      'BWC',            'BWC',            breaking, 1],
      ['no-BWC',      'BWC',            'no-BWC',         breaking, 0],
      ['no-BWC',      'no-BWC',         'undefined',      risky, 1],
      ['no-BWC',      'no-BWC',         'BWC',            risky, 1],
      ['no-BWC',      'no-BWC',         'no-BWC',         risky, 0],
    ]

    test.concurrent.each(removeOperationCases)(
      'should classify removed operation before(channel:%s, operation:%s) after(channel:%s) as %s',
      async (beforeCh, beforeOp, afterCh, expectedType, unclassified) => {
        const beforeYaml = generateAsyncApiTwoOperationsSpec(beforeCh, beforeOp)
        const afterYaml = generateAsyncApiSpec(afterCh)
        const packageId = `asyncapi-apikind-remove-operation/channel-${beforeCh}-${afterCh}-operation-${beforeOp}`

        const result = await buildChangelogFromContent(packageId, beforeYaml, afterYaml)
        expect(result).toEqual(changesSummaryMatcher(buildExpected(expectedType, unclassified), ASYNCAPI_API_TYPE))
      },
    )
  })

  describe('Remove channel tests (all x-api-kind combinations)', () => {
    // [beforeCh, beforeOp, expectedType, unclassified]
    // unclassified — number of UNCLASSIFIED changes caused by x-api-kind property itself being added/removed/changed
    type RemoveChCase = [ApiKindValue, ApiKindValue, ChangeType, number]

    const removeChannelCases: RemoveChCase[] = [
      ['undefined',     'undefined',      breaking, 0],
      ['undefined',     'BWC',            breaking, 0],
      ['undefined',     'no-BWC',         risky, 0],
      ['BWC',           'undefined',      breaking, 0],
      ['BWC',           'BWC',            breaking, 0],
      ['BWC',           'no-BWC',         risky, 0],
      ['no-BWC',        'undefined',      risky, 0],
      ['no-BWC',        'BWC',            breaking, 0],
      ['no-BWC',        'no-BWC',         risky, 0],
    ]

    test.concurrent.each(removeChannelCases)(
      'should classify removed channel before(channel:%s, operation:%s) as %s',
      async (beforeCh, beforeOp, expectedType, unclassified) => {
        const beforeYaml = generateAsyncApiTwoChannelsSpec(beforeCh, beforeOp)
        const afterYaml = generateAsyncApiSpec()
        const packageId = `asyncapi-apikind-remove-ch/channel-${beforeCh}-operation-${beforeOp}`

        const result = await buildChangelogFromContent(packageId, beforeYaml, afterYaml)
        expect(result).toEqual(changesSummaryMatcher(buildExpected(expectedType, unclassified), ASYNCAPI_API_TYPE))
      },
    )
  })

  describe('All x-api-kind combinations (channel + operation, before + after)', () => {
    // [beforeCh, beforeOp, afterCh, afterOp, expectedType, unclassified]
    // unclassified — number of UNCLASSIFIED changes caused by x-api-kind property itself being added/removed/changed
    type ComboCase = [ApiKindValue, ApiKindValue, ApiKindValue, ApiKindValue, ChangeType, number]

    const allCombinations: ComboCase[] = [
      // beforeCh=none, beforeOp=none
      ['undefined',     'undefined',      'undefined',      'undefined',      breaking, 0],
      ['undefined',     'undefined',      'undefined',      'BWC',            breaking, 1],
      ['undefined',     'undefined',      'undefined',      'no-BWC',         risky, 1],
      ['undefined',     'undefined',      'BWC',            'undefined',      breaking, 1],
      ['undefined',     'undefined',      'BWC',            'BWC',            breaking, 2],
      ['undefined',     'undefined',      'BWC',            'no-BWC',         risky, 2],
      ['undefined',     'undefined',      'no-BWC',         'undefined',      risky, 1],
      ['undefined',     'undefined',      'no-BWC',         'BWC',            breaking, 2],
      ['undefined',     'undefined',      'no-BWC',         'no-BWC',         risky, 2],
      // beforeCh=none, beforeOp=BWC
      ['undefined',     'BWC',      'undefined',      'undefined',      breaking, 1],
      ['undefined',     'BWC',      'undefined',      'BWC',            breaking, 0],
      ['undefined',     'BWC',      'undefined',      'no-BWC',         risky, 1],
      ['undefined',     'BWC',      'BWC',            'undefined',      breaking, 2],
      ['undefined',     'BWC',      'BWC',            'BWC',            breaking, 1],
      ['undefined',     'BWC',      'BWC',            'no-BWC',         risky, 2],
      ['undefined',     'BWC',      'no-BWC',         'undefined',      risky, 2],
      ['undefined',     'BWC',      'no-BWC',         'BWC',            breaking, 1],
      ['undefined',     'BWC',      'no-BWC',         'no-BWC',         risky, 2],
      // beforeCh=none, beforeOp=no-BWC
      ['undefined',    'no-BWC',      'undefined',      'undefined',      risky, 1],
      ['undefined',    'no-BWC',      'undefined',      'BWC',            risky, 1],
      ['undefined',    'no-BWC',      'undefined',      'no-BWC',         risky, 0],
      ['undefined',    'no-BWC',      'BWC',            'undefined',      risky, 2],
      ['undefined',    'no-BWC',      'BWC',            'BWC',            risky, 2],
      ['undefined',    'no-BWC',      'BWC',            'no-BWC',         risky, 1],
      ['undefined',    'no-BWC',      'no-BWC',         'undefined',      risky, 2],
      ['undefined',    'no-BWC',      'no-BWC',         'BWC',            risky, 2],
      ['undefined',    'no-BWC',      'no-BWC',         'no-BWC',         risky, 1],

      // beforeCh=BWC, beforeOp=none
      ['BWC',     'undefined',      'undefined',      'undefined',      breaking, 1],
      ['BWC',     'undefined',      'undefined',      'BWC',            breaking, 2],
      ['BWC',     'undefined',      'undefined',      'no-BWC',         risky, 2],
      ['BWC',     'undefined',      'BWC',            'undefined',      breaking, 0],
      ['BWC',     'undefined',      'BWC',            'BWC',            breaking, 1],
      ['BWC',     'undefined',      'BWC',            'no-BWC',         risky, 1],
      ['BWC',     'undefined',      'no-BWC',         'undefined',      risky, 1],
      ['BWC',     'undefined',      'no-BWC',         'BWC',            breaking, 2],
      ['BWC',     'undefined',      'no-BWC',         'no-BWC',         risky, 2],
      // beforeCh=BWC, beforeOp=BWC
      ['BWC',     'BWC',      'undefined',      'undefined',      breaking, 2],
      ['BWC',     'BWC',      'undefined',      'BWC',            breaking, 1],
      ['BWC',     'BWC',      'undefined',      'no-BWC',         risky, 2],
      ['BWC',     'BWC',      'BWC',            'undefined',      breaking, 1],
      ['BWC',     'BWC',      'BWC',            'BWC',            breaking, 0],
      ['BWC',     'BWC',      'BWC',            'no-BWC',         risky, 1],
      ['BWC',     'BWC',      'no-BWC',         'undefined',      risky, 2],
      ['BWC',     'BWC',      'no-BWC',         'BWC',            breaking, 1],
      ['BWC',     'BWC',      'no-BWC',         'no-BWC',         risky, 2],
      // beforeCh=BWC, beforeOp=no-BWC
      ['BWC',     'no-BWC',     'undefined',      'undefined',      risky, 2],
      ['BWC',     'no-BWC',     'undefined',      'BWC',            risky, 2],
      ['BWC',     'no-BWC',     'undefined',      'no-BWC',         risky, 1],
      ['BWC',     'no-BWC',     'BWC',            'undefined',      risky, 1],
      ['BWC',     'no-BWC',     'BWC',            'BWC',            risky, 1],
      ['BWC',     'no-BWC',     'BWC',            'no-BWC',         risky, 0],
      ['BWC',     'no-BWC',     'no-BWC',         'undefined',      risky, 2],
      ['BWC',     'no-BWC',     'no-BWC',         'BWC',            risky, 2],
      ['BWC',     'no-BWC',     'no-BWC',         'no-BWC',         risky, 1],

      // beforeCh=no-BWC, beforeOp=none
      ['no-BWC',      'undefined',      'undefined',      'undefined',      risky, 1],
      ['no-BWC',      'undefined',      'undefined',      'BWC',            risky, 2],
      ['no-BWC',      'undefined',      'undefined',      'no-BWC',         risky, 2],
      ['no-BWC',      'undefined',      'BWC',            'undefined',      risky, 1],
      ['no-BWC',      'undefined',      'BWC',            'BWC',            risky, 2],
      ['no-BWC',      'undefined',      'BWC',            'no-BWC',         risky, 2],
      ['no-BWC',      'undefined',      'no-BWC',         'undefined',      risky, 0],
      ['no-BWC',      'undefined',      'no-BWC',         'BWC',            risky, 1],
      ['no-BWC',      'undefined',      'no-BWC',         'no-BWC',         risky, 1],
      // beforeCh=no-BWC, beforeOp=BWC
      ['no-BWC',      'BWC',      'undefined',     'undefined',     breaking, 2],
      ['no-BWC',      'BWC',      'undefined',     'BWC',           breaking, 1],
      ['no-BWC',      'BWC',      'undefined',     'no-BWC',        risky, 2],
      ['no-BWC',      'BWC',      'BWC',           'undefined',     breaking, 2],
      ['no-BWC',      'BWC',      'BWC',           'BWC',           breaking, 1],
      ['no-BWC',      'BWC',      'BWC',           'no-BWC',        risky, 2],
      ['no-BWC',      'BWC',      'no-BWC',        'undefined',     risky, 1],
      ['no-BWC',      'BWC',      'no-BWC',        'BWC',           breaking, 0],
      ['no-BWC',      'BWC',      'no-BWC',        'no-BWC',        risky, 1],
      // beforeCh=no-BWC, beforeOp=no-BWC
      ['no-BWC',      'no-BWC',     'undefined',      'undefined',      risky, 2],
      ['no-BWC',      'no-BWC',     'undefined',      'BWC',            risky, 2],
      ['no-BWC',      'no-BWC',     'undefined',      'no-BWC',         risky, 1],
      ['no-BWC',      'no-BWC',     'BWC',            'undefined',      risky, 2],
      ['no-BWC',      'no-BWC',     'BWC',            'BWC',            risky, 2],
      ['no-BWC',      'no-BWC',     'BWC',            'no-BWC',         risky, 1],
      ['no-BWC',      'no-BWC',     'no-BWC',         'undefined',      risky, 1],
      ['no-BWC',      'no-BWC',     'no-BWC',         'BWC',            risky, 1],
      ['no-BWC',      'no-BWC',     'no-BWC',         'no-BWC',         risky, 0],
    ]

    test.concurrent.each(allCombinations)(
      'should classify before(channel:%s, operation:%s) after(channel:%s, operation:%s) as %s',
      async (beforeCh, beforeOp, afterCh, afterOp, expectedType, unclassified) => {
        const beforeYaml = generateAsyncApiSpec(beforeCh, beforeOp, 'number')
        const afterYaml = generateAsyncApiSpec(afterCh, afterOp, 'string')
        const packageId = `asyncapi-apikind-combo/channel-${beforeCh}-${afterCh}-operation-${beforeOp}-${afterOp}`

        const result = await buildChangelogFromContent(packageId, beforeYaml, afterYaml)
        expect(result).toEqual(changesSummaryMatcher(buildExpected(expectedType, unclassified), ASYNCAPI_API_TYPE))
      },
    )
  })
})
