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

import {
  API_KIND,
  BREAKING_CHANGE_TYPE,
  BUILD_TYPE,
  BuildResult,
  Labels,
  RISKY_CHANGE_TYPE,
  UNCLASSIFIED_CHANGE_TYPE,
  VERSION_STATUS,
} from '../src'
import { changesSummaryMatcher, Editor, LocalRegistry } from './helpers'
import { takeIfDefined } from '../src/utils'

let afterPackage: LocalRegistry
const AFTER_PACKAGE_ID = 'api-kinds'
const AFTER_VERSION_ID = 'v1'

describe('API Kinds test', () => {
  beforeAll(() => {
    afterPackage = LocalRegistry.openPackage(AFTER_PACKAGE_ID)
  })

  test('document with label must have no-bwc api kind', async () => {
    const editor = await Editor.openProject(AFTER_PACKAGE_ID, afterPackage)
    const result = await editor.run({
      version: AFTER_VERSION_ID,
      packageId: AFTER_PACKAGE_ID,
      files: [{
        fileId: 'Petstore.yaml',
        publish: true,
        labels: ['apihub/x-api-kind: no-bwc'],
      }],
    })

    expect(result.documents.get('Petstore.yaml')?.apiKind).toEqual(API_KIND.NO_BWC)
  })

  test('document with uppercase label must have no-bwc api kind', async () => {
    const editor = await Editor.openProject(AFTER_PACKAGE_ID, afterPackage)
    const result = await editor.run({
      version: AFTER_VERSION_ID,
      packageId: AFTER_PACKAGE_ID,
      files: [{
        fileId: 'Petstore.yaml',
        publish: true,
        labels: ['apihub/x-api-kind: no-BWC'],
      }],
    })

    expect(result.documents.get('Petstore.yaml')?.apiKind).toEqual(API_KIND.NO_BWC)
  })

  test('document with label must have experimental api kind', async () => {
    const editor = await Editor.openProject(AFTER_PACKAGE_ID, afterPackage)
    const result = await editor.run({
      version: AFTER_VERSION_ID,
      packageId: AFTER_PACKAGE_ID,
      files: [{
        fileId: 'Petstore.yaml',
        publish: true,
        labels: ['apihub/x-api-kind: experimental'],
      }],
    })

    expect(result.documents.get('Petstore.yaml')?.apiKind).toEqual(API_KIND.EXPERIMENTAL)
  })

  test('document with incorrect label value must have bwc api kind', async () => {
    const editor = await Editor.openProject(AFTER_PACKAGE_ID, afterPackage)
    const result = await editor.run({
      version: AFTER_VERSION_ID,
      packageId: AFTER_PACKAGE_ID,
      files: [{
        fileId: 'Petstore.yaml',
        publish: true,
        labels: ['apihub/x-api-kind: newApiKind!'],
      }],
    })

    expect(result.documents.get('Petstore.yaml')?.apiKind).toEqual(API_KIND.BWC)
  })

  test('version with label must have no-bwc api kind', async () => {
    const editor = await Editor.openProject(AFTER_PACKAGE_ID, afterPackage)
    const result = await editor.run({
      version: AFTER_VERSION_ID,
      packageId: AFTER_PACKAGE_ID,
      files: [{
        fileId: 'Petstore.yaml',
        publish: true,
      }],
      metadata: {
        versionLabels: ['apihub/x-api-kind: no-BWC'],
      },
    })

    expect(result.documents.get('Petstore.yaml')?.apiKind).toEqual(API_KIND.NO_BWC)
  })
})

const portal = new LocalRegistry(AFTER_PACKAGE_ID)
describe('Risky changes for no-bwc operations test', () => {
  beforeAll(async () => {
    await portal.publish(AFTER_PACKAGE_ID, {
      packageId: AFTER_PACKAGE_ID,
      version: 'v1',
      files: [{ fileId: 'Petstore.yaml' }],
    })

    await portal.publish(AFTER_PACKAGE_ID, {
      packageId: AFTER_PACKAGE_ID,
      version: 'v2',
      previousVersion: 'v1',
      files: [{ fileId: 'Petstorev2.yaml' }],
    })

    await portal.publish(AFTER_PACKAGE_ID, {
      packageId: AFTER_PACKAGE_ID,
      version: 'v3',
      previousVersion: 'v2',
      files: [{ fileId: 'Petstorev3.yaml' }],
    })
  })

  test('should have 2 risky change for no-bwc operations (changed and removed)', async () => {
    const editor = new Editor(AFTER_PACKAGE_ID, {
      packageId: AFTER_PACKAGE_ID,
      version: 'v2',
      status: VERSION_STATUS.RELEASE,
      previousVersion: 'v1',
      buildType: BUILD_TYPE.CHANGELOG,
    }, {}, portal)

    const result = await editor.run()

    expect(result.comparisons[0].operationTypes[0].changesSummary?.[RISKY_CHANGE_TYPE]).toBe(3)
  })

  test('should have 1 breaking change', async () => {
    const editor = new Editor(AFTER_PACKAGE_ID, {
      packageId: AFTER_PACKAGE_ID,
      version: 'v3',
      status: VERSION_STATUS.RELEASE,
      previousVersion: 'v1',
      buildType: BUILD_TYPE.CHANGELOG,
    }, {}, portal)

    const result = await editor.run()

    expect(result.comparisons[0].operationTypes[0].changesSummary?.[BREAKING_CHANGE_TYPE]).toBe(2)
  })
})

describe('Check Api Compatibility Function tests', () => {
  const PREV_VERSION = 'v1'
  const CURR_VERSION = 'v2'
  const API_KIND_NO_BWC_LABEL = 'apihub/x-api-kind: no-BWC'
  const API_KIND_BWC_LABEL = 'apihub/x-api-kind: BWC'

  describe('Publish ApiKind version Labels tests', () => {
    test('should apply api kind version label from previous document', async () => {
      const result = await runApiKindTest(
        'api-kinds/no-api-kind-in-documents', [], [], [API_KIND_NO_BWC_LABEL],
      )
      expect(result).toEqual(changesSummaryMatcher({ [RISKY_CHANGE_TYPE]: 1 }))
    })

    test('should apply api kind version label from current document', async () => {
      const result = await runApiKindTest(
        'api-kinds/no-api-kind-in-documents', [], [], [], [API_KIND_NO_BWC_LABEL],
      )
      expect(result).toEqual(changesSummaryMatcher({ [RISKY_CHANGE_TYPE]: 1 }))
    })
  })

  describe('Publish ApiKind file Labels tests', () => {
    test('should apply api kind label from previous document', async () => {
      const result = await runApiKindTest('api-kinds/no-api-kind-in-documents', [API_KIND_NO_BWC_LABEL])
      expect(result).toEqual(changesSummaryMatcher({ [RISKY_CHANGE_TYPE]: 1 }))
    })

    test('should apply api kind label from current document', async () => {
      const result = await runApiKindTest('api-kinds/no-api-kind-in-documents', [], [API_KIND_NO_BWC_LABEL])
      expect(result).toEqual(changesSummaryMatcher({ [RISKY_CHANGE_TYPE]: 1 }))
    })
  })

  describe('Publish ApiKind version Labels and file Labels priority tests', () => {
    test('should prioritize version label no-BWC over file label BWC in previous version', async () => {
      const result = await runApiKindTest(
        'api-kinds/no-api-kind-in-documents', [API_KIND_BWC_LABEL], [], [API_KIND_NO_BWC_LABEL],
      )
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }))
    })

    test('should prioritize version label no-BWC over file label BWC in current version', async () => {
      const result = await runApiKindTest(
        'api-kinds/no-api-kind-in-documents', [], [API_KIND_BWC_LABEL], [], [API_KIND_NO_BWC_LABEL],
      )
      expect(result).toEqual(changesSummaryMatcher({ [BREAKING_CHANGE_TYPE]: 1 }))
    })

    test('should prioritize file label no-BWC over version label BWC in previous version', async () => {
      const result = await runApiKindTest(
        'api-kinds/no-api-kind-in-documents', [API_KIND_NO_BWC_LABEL], [], [API_KIND_BWC_LABEL],
      )
      expect(result).toEqual(changesSummaryMatcher({ [RISKY_CHANGE_TYPE]: 1 }))
    })

    test('should prioritize file label no-BWC over version label BWC in current version', async () => {
      const result = await runApiKindTest(
        'api-kinds/no-api-kind-in-documents', [], [API_KIND_NO_BWC_LABEL], [], [API_KIND_BWC_LABEL],
      )
      expect(result).toEqual(changesSummaryMatcher({ [RISKY_CHANGE_TYPE]: 1 }))
    })
  })

  describe('ApiKind info section tests', () => {
    test('should apply api-kind label in previous document info section', async () => {
      const result = await runApiKindTest('api-kinds/api-kind-info-label-in-prev-document')
      expect(result).toEqual(changesSummaryMatcher({ [RISKY_CHANGE_TYPE]: 1 }))
    })

    test('should apply api-kind label in current document info section', async () => {
      const result = await runApiKindTest('api-kinds/api-kind-info-label-in-curr-document')
      expect(result).toEqual(changesSummaryMatcher({ [RISKY_CHANGE_TYPE]: 1 }))
    })
  })

  describe('ApiKind operations section tests', () => {
    test('should apply api-kind label in current document operation', async () => {
      const result = await runApiKindTest('api-kinds/api-kind-operation-label-curr-document')
      expect(result).toEqual(changesSummaryMatcher({
        [RISKY_CHANGE_TYPE]: 1,
        [UNCLASSIFIED_CHANGE_TYPE]: 1, // x-api-kind field in the operation also gives a diff
      }))
    })

    test('should apply api-kind label in previous document operation', async () => {
      const result = await runApiKindTest('api-kinds/api-kind-operation-label-prev-document')
      expect(result).toEqual(changesSummaryMatcher({
        [RISKY_CHANGE_TYPE]: 1,
        [UNCLASSIFIED_CHANGE_TYPE]: 1, // x-api-kind field in the operation also gives a diff
      }))
    })
  })

  async function runApiKindTest(
    packageId: string,
    prevFileLabels?: Labels,
    currFileLabels?: Labels,
    prevVersionLabels?: Labels,
    currVersionLabels?: Labels,
  ): Promise<BuildResult> {
    const portal = new LocalRegistry(packageId)

    await portal.publish(packageId, {
      packageId: packageId,
      version: PREV_VERSION,
      metadata: {...takeIfDefined({ versionLabels: prevVersionLabels }) },
      files: [{ fileId: '1.yaml', ...takeIfDefined({ labels: prevFileLabels }) }],
    })

    await portal.publish(packageId, {
      packageId: packageId,
      version: CURR_VERSION,
      metadata: {...takeIfDefined({ versionLabels: currVersionLabels }) },
      files: [{ fileId: '2.yaml', ...takeIfDefined({ labels: currFileLabels }) }],
    })

    const editor = new Editor(packageId, {
      packageId: packageId,
      version: CURR_VERSION,
      status: VERSION_STATUS.RELEASE,
      previousVersion: PREV_VERSION,
      buildType: BUILD_TYPE.CHANGELOG,
    }, {}, portal)

    return editor.run()
  }
})
