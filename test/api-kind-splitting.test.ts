import { BUILD_TYPE, BuildResult, VERSION_STATUS } from '../src'
import type { OperationChanges } from '../src'
import { Editor, LocalRegistry } from './helpers'

/**
 * The point of the api kind scope element in one document: two operations share a schema, one of them is
 * marked no-BWC, and the property removed from that schema is reported to each of them on its own terms.
 */
const PACKAGE_ID = 'api-kind-splitting'
const FILE_ID = 'shared.json'

const spec = (properties: Record<string, unknown>): string => JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Shared schema', version: '1.0.0' },
  paths: {
    '/marked': {
      post: {
        'x-api-kind': 'no-BWC',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Shared' } } } },
        responses: { '200': { description: 'OK' } },
      },
    },
    '/plain': {
      post: {
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Shared' } } } },
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  components: { schemas: { Shared: { type: 'object', properties: properties } } },
})

describe('One removal, two operations, two verdicts', () => {
  let result: BuildResult

  beforeAll(async () => {
    const portal = new LocalRegistry(PACKAGE_ID)

    await portal.publishFromContent(
      { [FILE_ID]: spec({ keep: { type: 'string' }, gone: { type: 'string' } }) },
      { packageId: PACKAGE_ID, version: 'v1', files: [{ fileId: FILE_ID, publish: true }] },
    )
    await portal.publishFromContent(
      { [FILE_ID]: spec({ keep: { type: 'string' } }) },
      { packageId: PACKAGE_ID, version: 'v2', files: [{ fileId: FILE_ID, publish: true }] },
    )

    result = await new Editor(PACKAGE_ID, {
      packageId: PACKAGE_ID,
      version: 'v2',
      previousVersion: 'v1',
      status: VERSION_STATUS.RELEASE,
      buildType: BUILD_TYPE.CHANGELOG,
    }, {}, portal).run()
  })

  it('reports the same removal as risky for the marked operation and breaking for the other', () => {
    const changesOf = (path: string): OperationChanges => {
      const changes = result.comparisons[0]?.data?.find(item => item.operationId?.includes(path))
      if (!changes) {
        throw new Error(`No changes for ${path}. Operations: ${result.comparisons[0]?.data?.map(item => item.operationId).join(', ')}`)
      }
      return changes
    }

    expect(changesOf('marked').changeSummary.risky).toBe(1)
    expect(changesOf('marked').changeSummary.breaking).toBe(0)
    expect(changesOf('plain').changeSummary.breaking).toBe(1)
    expect(changesOf('plain').changeSummary.risky).toBe(0)
  })
})
