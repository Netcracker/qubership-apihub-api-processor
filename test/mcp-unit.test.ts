/**
 * Copyright 2024-2025 NetCracker Technology Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { parseMcpFile } from '../src/apitypes/mcp/mcp.parser'
import { calculateMcpEntityId, wrapEntityData } from '../src/apitypes/mcp/mcp.entities'
import { MCP_DOCUMENT_TYPE } from '../src/apitypes/mcp/mcp.consts'
import { mcpBuilder } from '../src/apitypes/mcp'
import { createDuplicateMcpEntityHandler, createMcpBuildContext, processMcpDocument, validateMcpCapabilities } from '../src/components/mcp'
import { VersionDocument } from '../src/types'
import { ParsedMcpData } from '../src/apitypes/mcp/mcp.types'
import { McpKind } from '../src/types/package/mcp'
import { NotificationMessage } from '../src/types/package'
import { MESSAGE_SEVERITY } from '../src/consts'

const makeBlob = (obj: unknown): Blob => new Blob([JSON.stringify(obj)], { type: 'application/json' })

// minimal stand-in for a built MCP document — the functions under test only read fileId/type/data
const makeMcpDocument = (fileId: string, type: string, data: ParsedMcpData): VersionDocument<ParsedMcpData> =>
  ({ fileId, type, data, format: 'json' }) as unknown as VersionDocument<ParsedMcpData>

describe('MCP parser', () => {
  test('should detect init shape (capabilities + serverInfo) as init', async () => {
    const data = {
      protocolVersion: '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 'my-server', version: '1.0' },
    }
    const result = await parseMcpFile('init.json', makeBlob(data))
    expect(result).toBeDefined()
    expect(result!.type).toBe(MCP_DOCUMENT_TYPE.MCP_INIT)
    expect(result!.data.entities).toHaveLength(1)

    const [initEntity] = result!.data.entities
    expect(initEntity.kind).toBe('init')
    expect(initEntity.name).toBe('initialize')
  })

  test('should detect a file with capabilities as init and ignore its tools array', async () => {
    const data = {
      protocolVersion: '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 'my-server', version: '1.0' },
      tools: [{ name: 'tool1', inputSchema: { type: 'object' } }],
    }
    const result = await parseMcpFile('combined.json', makeBlob(data))
    expect(result).toBeDefined()
    expect(result!.type).toBe(MCP_DOCUMENT_TYPE.MCP_INIT)
    expect(result!.data.entities).toHaveLength(1)
    const [initEntity] = result!.data.entities
    expect(initEntity.kind).toBe('init')
  })

  test('should skip a non-object list item and report it', async () => {
    const result = await parseMcpFile('tools.json', makeBlob({
      tools: [42, { name: 'ok', inputSchema: { type: 'object' } }],
    }))
    expect(result).toBeDefined()
    expect(result!.data.entities).toHaveLength(1)
    const [okTool] = result!.data.entities
    expect(okTool.name).toBe('ok')
    expect(result!.errors!.some(e => /expected an object/.test(e.message))).toBe(true)
  })

  describe('list extraction', () => {
    // build a minimal valid item of the given kind (each list type has its own required fields)
    const makeItem = (kind: McpKind, name: string): Record<string, unknown> => {
      switch (kind) {
        case 'resource': return { uri: `file:///${name}`, name }
        case 'tool': return { name, inputSchema: { type: 'object' } }
        default: return { name } // prompt
      }
    }

    const listKinds: Array<{ key: string; kind: McpKind; type: string }> = [
      { key: 'tools', kind: 'tool', type: MCP_DOCUMENT_TYPE.MCP_TOOLS },
      { key: 'resources', kind: 'resource', type: MCP_DOCUMENT_TYPE.MCP_RESOURCES },
      { key: 'prompts', kind: 'prompt', type: MCP_DOCUMENT_TYPE.MCP_PROMPTS },
    ]

    describe.each(listKinds)('$key', ({ key, kind, type }) => {
      test('should detect a single entity', async () => {
        const result = await parseMcpFile(`${key}.json`, makeBlob({ [key]: [makeItem(kind, 'a')] }))
        expect(result!.type).toBe(type)
        expect(result!.data.entities).toHaveLength(1)
        expect(result!.data.entities.every(e => e.kind === kind)).toBe(true)
        expect(result!.data.entities.map(e => e.name)).toEqual(['a'])
      })

      test('should detect multiple entities', async () => {
        const result = await parseMcpFile(`${key}.json`, makeBlob({ [key]: [makeItem(kind, 'a'), makeItem(kind, 'b')] }))
        expect(result!.type).toBe(type)
        expect(result!.data.entities).toHaveLength(2)
        expect(result!.data.entities.every(e => e.kind === kind)).toBe(true)
        expect(result!.data.entities.map(e => e.name)).toEqual(['a', 'b'])
      })
    })
  })

  describe('rejects non-MCP / malformed input', () => {
    const cases: Array<{ name: string; fileId: string; blob: Blob }> = [
      { name: 'OpenAPI spec', fileId: 'spec.json', blob: makeBlob({ openapi: '3.0.0', info: { title: 'x', version: '1' } }) },
      { name: 'top-level array', fileId: 'arr.json', blob: makeBlob([1, 2, 3]) },
      { name: 'invalid JSON', fileId: 'bad.json', blob: new Blob(['not json'], { type: 'application/json' }) },
      { name: 'non-json extension', fileId: 'file.yaml', blob: new Blob(['{}'], { type: 'text/plain' }) },
      { name: 'empty object', fileId: 'empty.json', blob: makeBlob({}) },
      // MCP-specific: shape is detected, but yields no usable entities → not claimed as MCP
      { name: 'empty tools array', fileId: 'tools.json', blob: makeBlob({ tools: [] }) },
      { name: 'tools where every item lacks a name', fileId: 'tools.json', blob: makeBlob({ tools: [{ description: 'no name' }] }) },
    ]

    test.each(cases)('should return undefined for $name', async ({ fileId, blob }) => {
      expect(await parseMcpFile(fileId, blob)).toBeUndefined()
    })
  })
})

describe('MCP entity ID', () => {
  // exact outputs of calculateMcpEntityId; slugify charmap keeps `_` and `.` and case,
  // maps `/` and spaces to `-`, and `()[]{}` to `_` (see SLUG_OPTIONS_OPERATION_ID)
  const cases: Array<{ name: string; endpoint: string; kind: McpKind; entityName: string; expected: string }> = [
    { name: 'simple endpoint and name', endpoint: '/mcp', kind: 'tool', entityName: 'search_docs', expected: 'mcp-tool-search_docs' },
    { name: 'trailing slash is trimmed', endpoint: '/mcp/', kind: 'tool', entityName: 'x', expected: 'mcp-tool-x' },
    { name: 'nested path endpoint', endpoint: '/api/v1', kind: 'tool', entityName: 'get_forecast', expected: 'api-v1-tool-get_forecast' },
    { name: 'prompt kind', endpoint: '/mcp', kind: 'prompt', entityName: 'summarize', expected: 'mcp-prompt-summarize' },
    { name: 'space in name becomes a hyphen', endpoint: '/mcp', kind: 'tool', entityName: 'get forecast', expected: 'mcp-tool-get-forecast' },
    { name: 'case and dot are preserved', endpoint: '/mcp', kind: 'tool', entityName: 'Get.Forecast', expected: 'mcp-tool-Get.Forecast' },
    { name: 'parentheses become underscores', endpoint: '/mcp', kind: 'tool', entityName: 'search(docs)', expected: 'mcp-tool-search_docs_' },
  ]

  test.each(cases)('should build $expected for $name', ({ endpoint, kind, entityName, expected }) => {
    expect(calculateMcpEntityId(endpoint, kind, entityName)).toBe(expected)
  })

  // collision: distinct raw names can slugify to the same id (space vs slash both → '-').
  // the id calc does NOT auto-disambiguate — the build instead fails on the duplicate id
  // (see 'MCP cross-document duplicate detection' and the build-level duplicate tests)
  test('should produce the same ID for distinct raw names that normalize to the same slug', () => {
    expect(calculateMcpEntityId('/mcp', 'tool', 'get forecast'))
      .toBe(calculateMcpEntityId('/mcp', 'tool', 'get/forecast'))
  })
})

describe('MCP capability cross-check', () => {
  const initParsed = (capabilities: Record<string, unknown>): ParsedMcpData => ({
    entities: [{ kind: 'init', name: 'initialize', data: {} }],
    originalDocument: { capabilities, serverInfo: { name: 'test', version: '1.0' } },
  })
  const toolParsed = (name: string): ParsedMcpData => ({
    entities: [{ kind: 'tool', name, data: { name, inputSchema: { type: 'object' } } }],
    originalDocument: { tools: [{ name, inputSchema: { type: 'object' } }] },
  })

  // process every doc into one context, then run the capability cross-check and return its notifications
  const runCapabilityCheck = (
    docs: Array<{ fileId: string; endpoint: string; type: string; parsed: ParsedMcpData }>,
  ): NotificationMessage[] => {
    const ctx = createMcpBuildContext()
    const documents = new Map<string, VersionDocument>()
    for (const { fileId, endpoint, type, parsed } of docs) {
      const doc = makeMcpDocument(fileId, type, parsed)
      processMcpDocument({ fileId, metadata: { mcpEndpoint: endpoint } }, doc, mcpBuilder, ctx)
      documents.set(fileId, doc)
    }
    const notifications: NotificationMessage[] = []
    validateMcpCapabilities(ctx.mcpEntities, documents, notifications)
    return notifications
  }

  test('should warn when init declares tools capability but no tools are found', () => {
    const notifications = runCapabilityCheck([
      { fileId: 'init.json', endpoint: '/api/v1', type: MCP_DOCUMENT_TYPE.MCP_INIT, parsed: initParsed({ tools: {} }) },
    ])
    expect(notifications).toHaveLength(1)
    expect(notifications[0].severity).toBe(MESSAGE_SEVERITY.Warning)
    expect(notifications[0].message).toContain('tools')
    expect(notifications[0].message).toContain('/api/v1')
  })

  test('should not warn when init declares tools and tools exist', () => {
    const notifications = runCapabilityCheck([
      { fileId: 'init.json', endpoint: '/api/v1', type: MCP_DOCUMENT_TYPE.MCP_INIT, parsed: initParsed({ tools: {} }) },
      { fileId: 'tools.json', endpoint: '/api/v1', type: MCP_DOCUMENT_TYPE.MCP_TOOLS, parsed: toolParsed('my_tool') },
    ])
    expect(notifications).toHaveLength(0)
  })

  test('should not warn when no init capabilities are declared', () => {
    const notifications = runCapabilityCheck([
      { fileId: 'tools.json', endpoint: '/api/v1', type: MCP_DOCUMENT_TYPE.MCP_TOOLS, parsed: toolParsed('my_tool') },
    ])
    expect(notifications).toHaveLength(0)
  })

  test('should scope the check per endpoint — tools on another endpoint do not satisfy the init', () => {
    // init declares tools on /api/a, but the only tools entity lives on /api/b
    const notifications = runCapabilityCheck([
      { fileId: 'init.json', endpoint: '/api/a', type: MCP_DOCUMENT_TYPE.MCP_INIT, parsed: initParsed({ tools: {} }) },
      { fileId: 'tools.json', endpoint: '/api/b', type: MCP_DOCUMENT_TYPE.MCP_TOOLS, parsed: toolParsed('my_tool') },
    ])
    expect(notifications).toHaveLength(1)
    expect(notifications[0].message).toContain('/api/a')
  })
})

describe('wrapEntityData (table)', () => {
  const item = { name: 'x', foo: 1 }
  const cases: Array<{ kind: McpKind; expected: unknown }> = [
    { kind: 'tool', expected: { tools: [item] } },
    { kind: 'resource', expected: { resources: [item] } },
    { kind: 'prompt', expected: { prompts: [item] } },
    // init is stored raw, without a wrapper
    { kind: 'init', expected: item },
  ]

  test.each(cases)('should wrap $kind data', ({ kind, expected }) => {
    expect(wrapEntityData(kind, item)).toEqual(expected)
  })
})

describe('MCP cross-document duplicate detection', () => {
  const toolDoc = (): ParsedMcpData => ({
    entities: [{ kind: 'tool', name: 'search', data: { name: 'search', inputSchema: { type: 'object' } } }],
    originalDocument: { tools: [{ name: 'search', inputSchema: { type: 'object' } }] },
  })

  const process = (ctx: ReturnType<typeof createMcpBuildContext>, fileId: string, endpoint: string): void =>
    processMcpDocument(
      { fileId, metadata: { mcpEndpoint: endpoint } },
      makeMcpDocument(fileId, MCP_DOCUMENT_TYPE.MCP_TOOLS, toolDoc()),
      mcpBuilder,
      ctx,
      createDuplicateMcpEntityHandler(),
    )

  test('should throw when the same entity ID appears in two documents', () => {
    const ctx = createMcpBuildContext()
    process(ctx, 'tools-a.json', '/api/v1')
    expect(() => process(ctx, 'tools-b.json', '/api/v1')).toThrow(/found in different documents/)
  })

  test('should not throw when the same name lives under different endpoints', () => {
    const ctx = createMcpBuildContext()
    process(ctx, 'tools-a.json', '/api/v1')
    expect(() => process(ctx, 'tools-b.json', '/api/v2')).not.toThrow()
  })
})

describe('MCP schema validation (2024-11-05 … 2025-11-25)', () => {
  const errorsOf = async (fileId: string, payload: unknown): Promise<string[]> => {
    const result = await parseMcpFile(fileId, makeBlob(payload))
    return (result?.errors ?? []).map((e: { message: string }) => e.message)
  }

  test('should report no schema errors for a valid tools document', async () => {
    expect(await errorsOf('tools.json', {
      tools: [{ name: 't', description: 'd', inputSchema: { type: 'object' } }],
    })).toHaveLength(0)
  })

  test('should report a tool missing required inputSchema (entity still built)', async () => {
    const result = await parseMcpFile('tools.json', makeBlob({ tools: [{ name: 't' }] }))
    expect(result).toBeDefined()
    expect(result!.data.entities).toHaveLength(1)
    expect(result!.errors!.some(e => /inputSchema/.test(e.message))).toBe(true)
  })

  test('should report init missing serverInfo.version', async () => {
    const errors = await errorsOf('init.json', {
      protocolVersion: '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 's' },
    })
    expect(errors.some(m => /version/.test(m))).toBe(true)
  })

  test('should report a resource missing required uri', async () => {
    const errors = await errorsOf('resources.json', { resources: [{ name: 'r' }] })
    expect(errors.some(m => /uri/.test(m))).toBe(true)
  })
})
