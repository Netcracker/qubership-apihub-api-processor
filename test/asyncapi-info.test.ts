import { buildPackage } from './helpers'
import { v3 as AsyncAPIV3 } from '@asyncapi/parser/esm/spec-types'

describe('Info', () => {
  describe('Tags', () => {
    test('Simple', async () => {
      await runTagsTest(
        'asyncapi/info/tags/simple',
        [
          {
            'name': 'simple_tag1',
            'description': 'Description for simple_tag1',
          },
          {
            'name': 'simple_tag2',
            'description': 'Description for simple_tag2',
          },
        ])
    })

    test('Refs', async () => {
      await runTagsTest(
        'asyncapi/info/tags/refs',
        [
          {
            'name': 'ref_tag1',
            'description': 'Description for ref_tag1',
          },
          {
            'name': 'ref_tag2',
            'description': 'Description for ref_tag2',
          },
        ])
    })

    test('mixed', async () => {
      await runTagsTest(
        'asyncapi/info/tags/mixed',
        [
          {
            'name': 'ref_tag1',
            'description': 'Description for ref_tag1',
          },
          {
            'name': 'simple_tag2',
            'description': 'Description for simple_tag2',
          },
        ])
    })

    async function runTagsTest(packageId: string, expectedTags: AsyncAPIV3.TagObject[]): Promise<void> {
      const result = await buildPackage(packageId)

      const [document] = Array.from(result.documents.values())
      const { tags } = document.metadata
      expect(tags).toEqual(expectedTags)
    }
  })
  
  describe('External documentation', () => {
    test('Simple', async () => {
      await runExternalDocumentationTest('asyncapi/info/external-documentation/simple', {
        'description': 'Simple',
        'url': 'https://example.com/docs',
      })
    })

    test('Refs', async () => {
      await runExternalDocumentationTest('asyncapi/info/external-documentation/refs', {
        'description': 'Ref',
        'url': 'https://example.com/docs',
      })
    })

    async function runExternalDocumentationTest(
      packageId: string,
      expectedExternalDocumentationObject: AsyncAPIV3.ExternalDocumentationObject,
    ): Promise<void> {
      const result = await buildPackage(packageId)

      const [document] = Array.from(result.documents.values())
      const { externalDocs } = document.metadata
      expect(externalDocs).toEqual(expectedExternalDocumentationObject)
    }
  })
})
