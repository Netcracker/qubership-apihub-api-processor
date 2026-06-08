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

import { describe, expect, test } from '@jest/globals'
import { Editor, LocalRegistry, VERSIONS_PATH, loadFileAsStringFromRegistry } from './helpers'
import { BUILD_TYPE, REST_API_TYPE, VERSION_STATUS } from '../src/consts'
import { MCP_DOCUMENT_TYPE } from '../src/apitypes/mcp'
import { McpEntity, McpEntityIndex, McpKind, PackageMcpEntity } from '../src/types/package/mcp'

const MCP_ENDPOINT = '/mcp'

// mcpEntities is a flat Map keyed by id, valued by McpEntity (index fields + data); pull out a kind's entities
const entitiesOfKind = (
  result: { mcpEntities?: McpEntityIndex },
  kind: McpKind,
): McpEntity[] => Array.from(result.mcpEntities?.values() ?? []).filter(e => e.kind === kind)

// assert the built entity count per kind; kinds omitted from `counts` are expected to be absent (0)
const expectEntityCounts = (
  result: { mcpEntities?: McpEntityIndex },
  counts: Partial<Record<McpKind, number>>,
): void => {
  const kinds: McpKind[] = ['init', 'tool', 'resource', 'prompt']
  for (const kind of kinds) {
    expect(entitiesOfKind(result, kind)).toHaveLength(counts[kind] ?? 0)
  }
}

// assert a (possibly undefined) entity exists and matches the given subset of index fields
const expectEntity = (
  entity: PackageMcpEntity | undefined,
  expected: Partial<PackageMcpEntity>,
): void => {
  expect(entity).toBeDefined()
  expect(entity).toMatchObject(expected)
}

function createMcpEditor(registry?: LocalRegistry): Editor {
  const packageId = 'mcp-build'
  const reg = registry ?? LocalRegistry.openPackage(packageId)
  return new Editor(packageId, {
    packageId,
    version: 'v1',
    status: VERSION_STATUS.RELEASE,
    buildType: BUILD_TYPE.BUILD,
    files: [],
  }, {}, reg)
}

describe('MCP Build', () => {

  describe('Document types', () => {
    test('should produce init document type from init file', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'init.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })
      const doc = result.documents.get('init.json')
      expect(doc).toBeDefined()
      expect(doc!.type).toBe(MCP_DOCUMENT_TYPE.MCP_INIT)
    })

    test('should produce tools document type from tools file', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'tools.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })
      const doc = result.documents.get('tools.json')
      expect(doc).toBeDefined()
      expect(doc!.type).toBe(MCP_DOCUMENT_TYPE.MCP_TOOLS)
    })

    test('should produce resources document type from resources file', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'resources.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })
      const doc = result.documents.get('resources.json')
      expect(doc).toBeDefined()
      expect(doc!.type).toBe(MCP_DOCUMENT_TYPE.MCP_RESOURCES)
    })

    test('should produce prompts document type from prompts file', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'prompts.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })
      const doc = result.documents.get('prompts.json')
      expect(doc).toBeDefined()
      expect(doc!.type).toBe(MCP_DOCUMENT_TYPE.MCP_PROMPTS)
    })
  })

  describe('Entity extraction', () => {
    test('should extract tool entities from tools file', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'tools.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      expect(result.mcpEntities).toBeDefined()
      expectEntityCounts(result, { tool: 2 })

      const searchDocTool = entitiesOfKind(result, 'tool').find(t => t.title === 'search_docs')
      expectEntity(searchDocTool, {
        kind: 'tool',
        mcpEndpoint: MCP_ENDPOINT,
        description: 'Search through documentation',
        search: { useEntityDataAsSearchText: true },
        documentId: 'tools.json',
      })
    })

    test('should extract resource entities from resources file', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'resources.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      expect(result.mcpEntities).toBeDefined()
      expectEntityCounts(result, { resource: 2 })

      const readme = entitiesOfKind(result, 'resource').find(r => r.title === 'readme')
      expectEntity(readme, {
        kind: 'resource',
        mcpEndpoint: MCP_ENDPOINT,
        description: 'Project README file',
        search: { useEntityDataAsSearchText: true },
        documentId: 'resources.json',
      })
    })

    test('should extract prompt entities from prompts file', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'prompts.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      expect(result.mcpEntities).toBeDefined()
      expectEntityCounts(result, { prompt: 2 })

      const summarize = entitiesOfKind(result, 'prompt').find(p => p.title === 'summarize')
      expectEntity(summarize, {
        kind: 'prompt',
        mcpEndpoint: MCP_ENDPOINT,
        description: 'Summarize the given text',
        search: { useEntityDataAsSearchText: true },
        documentId: 'prompts.json',
      })
    })

    test('should extract init entity from init file', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'init.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      expect(result.mcpEntities).toBeDefined()
      expectEntityCounts(result, { init: 1 })

      const init = entitiesOfKind(result, 'init').find(i => i.title === 'init')
      // init title is always the fixed 'init' label, even though init.json declares its own `title`
      expectEntity(init, {
        kind: 'init',
        title: 'init',
        description: '',
        mcpEndpoint: MCP_ENDPOINT,
        search: { useEntityDataAsSearchText: true },
        documentId: 'init.json',
      })
    })

    test('should prefer the source title and default a missing description to empty', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'tools-title.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })
      expectEntityCounts(result, { tool: 2 })

      // source `title` wins over the name fallback
      const withTitle = entitiesOfKind(result, 'tool').find(t => t.mcpEntityId === 'mcp-tool-with_title')
      expect(withTitle?.title).toBe('Nice Title')

      // no title → title falls back to the name; no description → empty string
      const noDesc = entitiesOfKind(result, 'tool').find(t => t.mcpEntityId === 'mcp-tool-no_desc')
      expect(noDesc?.title).toBe('no_desc')
      expect(noDesc?.description).toBe('')
    })
  })

  describe('Entity ID format', () => {
    test('should use hyphen-separated entity IDs', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'tools.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      const tool = entitiesOfKind(result, 'tool').find(t => t.title === 'search_docs')
      expect(tool!.mcpEntityId).toMatch(/^mcp-tool-search_docs$/)
    })

    test('should not collide when tool and resource have the same name', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'tools-same-name.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
          { fileId: 'resources-same-name.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      expectEntityCounts(result, { tool: 1, resource: 1 })
      expect(entitiesOfKind(result, 'tool')[0].mcpEntityId).not.toBe(entitiesOfKind(result, 'resource')[0].mcpEntityId)
    })
  })

  describe('Entity payload', () => {
    test('should build the tool entity data as a complete tool item wrapped in tools array', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'tools.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      const tool = entitiesOfKind(result, 'tool').find(t => t.title === 'search_docs')
      expect(tool?.data).toEqual({
        tools: [{
          name: 'search_docs',
          description: 'Search through documentation',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Search query' } },
            required: ['query'],
          },
        }],
      })
    })

    test('should build the resource entity data as a complete resource item wrapped in resources array', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'resources.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      const readme = entitiesOfKind(result, 'resource').find(r => r.title === 'readme')
      expect(readme?.data).toEqual({
        resources: [{
          uri: 'file:///docs/readme.md',
          name: 'readme',
          description: 'Project README file',
          mimeType: 'text/markdown',
        }],
      })
    })

    test('should build the prompt entity data as a complete prompt item wrapped in prompts array', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'prompts.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      const summarize = entitiesOfKind(result, 'prompt').find(p => p.title === 'summarize')
      expect(summarize?.data).toEqual({
        prompts: [{
          name: 'summarize',
          description: 'Summarize the given text',
          arguments: [
            { name: 'text', description: 'Text to summarize', required: true },
            { name: 'max_length', description: 'Maximum length of summary', required: false },
          ],
        }],
      })
    })

    test('should keep the init entity data as the complete raw init object (no wrapper)', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'init.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      const init = entitiesOfKind(result, 'init').find(i => i.title === 'init')
      expect(init?.data).toEqual({
        capabilities: {
          tools: { listChanged: true },
          resources: { subscribe: true, listChanged: true },
          prompts: { listChanged: true },
          logging: {},
        },
        protocolVersion: '2025-11-25',
        serverInfo: { name: 'test-mcp-server', version: '1.0.0' },
        title: 'Server Display Title',
        instructions: 'This is a test MCP server for unit testing.',
      })
    })
  })

  describe('All four types together', () => {
    test('should build, publish and serialize all MCP entity types', async () => {
      const registry = LocalRegistry.openPackage('mcp-build')
      const editor = createMcpEditor(registry)

      const result = await editor.run({
        files: [
          { fileId: 'init.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
          { fileId: 'tools.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
          { fileId: 'resources.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
          { fileId: 'prompts.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      expect(result.documents.size).toBe(4)
      expect(result.mcpEntities).toBeDefined()
      expectEntityCounts(result, { init: 1, tool: 2, resource: 2, prompt: 2 })
      expect(result.operations.size).toBe(0)

      await registry.publishPackage(result, editor.builder.builderContext(editor.config), editor.config)

      // mcp.json — the lightweight index, grouped by kind, with payloads (`data`) stripped out
      const index = JSON.parse((await loadFileAsStringFromRegistry(VERSIONS_PATH, 'mcp-build/v1', 'mcp.json'))!)
      expect(index.inits).toHaveLength(1)
      expect(index.tools).toHaveLength(2)
      expect(index.resources).toHaveLength(2)
      expect(index.prompts).toHaveLength(2)

      const searchDocs = index.tools.find((t: PackageMcpEntity) => t.title === 'search_docs')
      expect(searchDocs).toMatchObject({
        mcpEntityId: 'mcp-tool-search_docs',
        kind: 'tool',
        title: 'search_docs',
        description: 'Search through documentation',
        mcpEndpoint: MCP_ENDPOINT,
      })
      expect(searchDocs).not.toHaveProperty('data')

      // mcp/{id}.json — the full element payload lives here, not in the index
      const payload = JSON.parse((await loadFileAsStringFromRegistry(VERSIONS_PATH, 'mcp-build/v1/mcp', searchDocs.mcpEntityId))!)
      expect(payload).toEqual({
        tools: [{
          name: 'search_docs',
          description: 'Search through documentation',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Search query' } },
            required: ['query'],
          },
        }],
      })
    }, 30000)
  })

  describe('Capabilities validation', () => {
    test('should warn when init declares capability but no entities found', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'init.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
          { fileId: 'tools.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      const warnings = result.notifications.filter(n => n.severity === 1)
      expect(warnings.some(w => w.message.includes('\'resources\'') && w.message.includes('no resource entities'))).toBe(true)
      expect(warnings.some(w => w.message.includes('\'prompts\'') && w.message.includes('no prompt entities'))).toBe(true)
      expect(warnings.some(w => w.message.includes('\'tools\''))).toBe(false)
    })

    test('should not warn when all capabilities matched', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'init.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
          { fileId: 'tools.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
          { fileId: 'resources.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
          { fileId: 'prompts.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      const warnings = result.notifications.filter(n => n.severity === 1)
      expect(warnings).toHaveLength(0)
    })

    test('should not warn when no init document provided', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'tools.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      const warnings = result.notifications.filter(n => n.severity === 1)
      expect(warnings).toHaveLength(0)
    })
  })

  describe('Duplicate detection', () => {
    test('should fail on duplicate name within a single file', async () => {
      const editor = createMcpEditor()
      await expect(
        editor.run({
          files: [
            { fileId: 'tools-duplicate-name.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
          ],
        }),
      ).rejects.toThrow(/Duplicate MCP entity ID/)
    })

    test('should fail on duplicate entity id across files sharing an endpoint', async () => {
      const editor = createMcpEditor()
      // both files declare a tool named "search" → same id under the same endpoint
      await expect(
        editor.run({
          files: [
            { fileId: 'tools-same-name.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
            { fileId: 'tools-same-name-2.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
          ],
        }),
      ).rejects.toThrow(/found in different documents/)
    })

    test('should not collide when the same tool name is under different endpoints', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'tools-same-name.json', metadata: { mcpEndpoint: '/mcp/a' } },
          { fileId: 'tools-same-name-2.json', metadata: { mcpEndpoint: '/mcp/b' } },
        ],
      })

      expectEntityCounts(result, { tool: 2 })
      const ids = entitiesOfKind(result, 'tool').map(t => t.mcpEntityId)
      expect(new Set(ids).size).toBe(2)
    })
  })

  describe('Validation', () => {
    test('should fail when mcpEndpoint is missing', async () => {
      const editor = createMcpEditor()
      await expect(
        editor.run({
          files: [
            { fileId: 'tools.json' },
          ],
        }),
      ).rejects.toThrow(/mcpEndpoint/)
    })

    test('should report a schema violation (tool missing inputSchema) but still build the entity', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'tools-missing-inputschema.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      // entity is still produced (schema errors are reported, not fatal)
      expectEntityCounts(result, { tool: 1 })
      const note = result.notifications.find(n => /inputSchema/.test(n.message))
      expect(note).toBeDefined()
    })

    test('should skip a list item without a name and report it', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'tools-partial-invalid.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      // the valid tool is built, the nameless one is dropped instead of producing a degenerate id
      expectEntityCounts(result, { tool: 1 })
      expect(entitiesOfKind(result, 'tool')[0].title).toBe('valid_tool')

      // the skipped item is surfaced as a notification rather than silently swallowed
      const note = result.notifications.find(n => /missing or empty required 'name'/.test(n.message))
      expect(note).toBeDefined()
      expect(note!.fileId).toBe('tools-partial-invalid.json')
    })
  })

  describe('Incremental update', () => {
    test('should drop only its entities when an MCP file is removed', async () => {
      const editor = createMcpEditor()
      const initial = await editor.run({
        files: [
          { fileId: 'tools.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
          { fileId: 'resources.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })
      expectEntityCounts(initial, { tool: 2, resource: 2 })

      const updated = await editor.update(
        { files: [{ fileId: 'resources.json', metadata: { mcpEndpoint: MCP_ENDPOINT } }] },
        [],
      )

      expectEntityCounts(updated, { resource: 2 })
    })

    test('should replace its entities when an MCP file is changed', async () => {
      const editor = createMcpEditor()
      await editor.run({
        files: [{ fileId: 'tools.json', metadata: { mcpEndpoint: MCP_ENDPOINT } }],
      })

      await editor.updateJsonFile('tools.json', () => ({
        tools: [{ name: 'only_one', description: 'single', inputSchema: { type: 'object' } }],
      }))
      const updated = await editor.update({}, ['tools.json'])

      expectEntityCounts(updated, { tool: 1 })
      expect(entitiesOfKind(updated, 'tool')[0].title).toBe('only_one')
    })
  })

  describe('Multiple endpoints', () => {
    test('should publish entities from different endpoints into one mcp.json', async () => {
      const registry = LocalRegistry.openPackage('mcp-build')
      const editor = createMcpEditor(registry)

      // both files declare a tool named "search" — distinct endpoints keep their ids apart
      const result = await editor.run({
        files: [
          { fileId: 'tools-same-name.json', metadata: { mcpEndpoint: '/mcp/a' } },
          { fileId: 'tools-same-name-2.json', metadata: { mcpEndpoint: '/mcp/b' } },
        ],
      })
      expectEntityCounts(result, { tool: 2 })

      await registry.publishPackage(result, editor.builder.builderContext(editor.config), editor.config)

      const index = JSON.parse((await loadFileAsStringFromRegistry(VERSIONS_PATH, 'mcp-build/v1', 'mcp.json'))!)
      expect(index.tools).toHaveLength(2)
      const ids = index.tools.map((t: PackageMcpEntity) => t.mcpEntityId)
      expect(new Set(ids).size).toBe(2)
      const endpoints = index.tools.map((t: PackageMcpEntity) => t.mcpEndpoint)
      expect(new Set(endpoints)).toEqual(new Set(['/mcp/a', '/mcp/b']))
    }, 30000)
  })

  describe('Mixed with operations', () => {
    test('should build MCP entities and REST operations from the same package', async () => {
      const editor = createMcpEditor()
      const result = await editor.run({
        files: [
          { fileId: 'simple-rest-api-for-mixed.json' },
          { fileId: 'tools.json', metadata: { mcpEndpoint: MCP_ENDPOINT } },
        ],
      })

      // REST operations and MCP entities coexist, each routed by its own builder
      const operations = Array.from(result.operations.values())
      expect(operations).toHaveLength(1)
      expect(operations[0].apiType).toBe(REST_API_TYPE)
      expectEntityCounts(result, { tool: 2 })
    })
  })
})
