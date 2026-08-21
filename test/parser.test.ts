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

import { Editor, LocalRegistry, loadFileAsStringFromRegistry, VERSIONS_PATH } from './helpers'
import { MESSAGE_CATEGORY, MESSAGE_SEVERITY, VERSION_STATUS } from '../src/consts'
import { buildDocument } from '../src/components/document'
import { DocumentBuildError } from '../src/errors'
import { FILE_KIND } from '../src/types'

const brokenPackage = LocalRegistry.openPackage('broken')


// A file the parser cannot read no longer costs the version: it is published as-is, without operations, and
// the reason is reported. Replaces the old expectation that the build throws.
const expectToleratedParseFailure = async (fileId: string): Promise<void> => {
  const editor = await Editor.openProject('broken', brokenPackage)
  const result = await editor.run({ files: [{ fileId, publish: true, labels: [] }] })

  const document = result.documents.get(fileId)
  expect(document).toBeDefined()
  expect(document!.source).toBeDefined()
  expect(result.operations.size).toBe(0)

  const parseFailure = result.notifications.find(({ category }) => category === MESSAGE_CATEGORY.ParseFile)
  expect(parseFailure).toBeDefined()
  expect(parseFailure!.severity).toBe(MESSAGE_SEVERITY.Error)
  expect(parseFailure!.message).toContain(`Cannot parse file ${fileId}.`)
  expect(parseFailure!.documentId).toBe(document!.slug)
}

// The packaging regression this tolerance would otherwise hit: an error document with no source used to make
// `dumpUnknownDocument` throw, so the whole archive failed after the build had already succeeded.
describe('Error documents survive packaging', () => {
  test('a version whose only document fails to parse still produces a complete archive', async () => {
    const registry = LocalRegistry.openPackage('broken')
    const result = await registry.publish('broken', {
      packageId: 'broken',
      version: 'v1',
      status: VERSION_STATUS.DRAFT,
      files: [{ fileId: 'missing_brace.json', publish: true }],
    })

    const document = result.documents.get('missing_brace.json')
    expect(document).toBeDefined()

    const documents = JSON.parse((await loadFileAsStringFromRegistry(VERSIONS_PATH, 'broken/v1', 'documents.json'))!)
    expect(documents.documents.map(({ fileId }: { fileId: string }) => fileId)).toEqual(['missing_brace.json'])

    // the archive carries the broken file itself — that is the troubleshooting artifact
    const raw = await loadFileAsStringFromRegistry(VERSIONS_PATH, 'broken/v1/documents', document!.filename)
    expect(raw).toBeTruthy()
    expect(raw).toContain('openapi')
  }, 30000)
})

describe('Basic project (one file): validation broken', () => {
  describe('JSON format', () => {
    test('JSON content in YAML-extension file', async () => {
      const editor = await Editor.openProject('broken', brokenPackage)
      const result = await editor.run({ files: [{ fileId: 'openapi.yaml', publish: true, labels: [] }] })

      expect(result.documents.get('openapi.yaml')?.type).toBe('openapi-3-0')
    })

    test('missing quote', async () => {
      await expectToleratedParseFailure('missing_quote.json')
    })

    test('missing comma', async () => {
      await expectToleratedParseFailure('missing_comma.json')
    })

    test('missing brace', async () => {
      await expectToleratedParseFailure('missing_brace.json')
    })

    test('missing bracket', async () => {
      await expectToleratedParseFailure('missing_bracket.json')
    })
  })

  describe('YAML format', () => {
    test('missing quote', async () => {
      await expectToleratedParseFailure('missing_quote.yaml')
    })

    test('missing dash', async () => {
      await expectToleratedParseFailure('missing_dash.yaml')
    })

    test('duplicate keys', async () => {
      await expectToleratedParseFailure('apihub-api-5 (1).yml')
    })

    test('a key of node is missing', async () => {
      await expectToleratedParseFailure('OpenApi 3.0.yaml')
    })

    test('openapi-2', async () => {
      await expectToleratedParseFailure('OpenApi 3.0-2.yaml')
    })
  })
})

// A nested failure keeps its own category through the wrapper `buildDocument` puts around it — without that,
// every api-type-specific failure would flatten into the generic `build-document`.
describe('Document build failures', () => {
  test('buildDocument preserves the category of a nested DocumentBuildError', async () => {
    const failingBuilder = {
      apiType: 'rest',
      types: ['unit-test-type'],
      buildDocument: () => {
        throw new DocumentBuildError('nested failure', MESSAGE_CATEGORY.SwaggerConversion)
      },
    }

    const build = buildDocument(
      { fileId: 'x.json', type: 'unit-test-type', kind: FILE_KIND.TEXT, data: {}, source: new Blob([]) } as never,
      { fileId: 'x.json', slug: 'x' } as never,
      { apiBuilders: [failingBuilder] } as never,
    )

    await expect(build).rejects.toMatchObject({ category: MESSAGE_CATEGORY.SwaggerConversion })
    // the wrapper names the document, matching the `documentId` the notification will carry
    await expect(build).rejects.toThrow('Cannot process the "x" document')
  })
})
