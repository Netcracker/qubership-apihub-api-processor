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
  BUILD_TYPE,
  BuildConfig,
  BuildConfigFile,
  BuildResult,
  BuildType,
  Labels,
  VERSION_STATUS,
  VERSION_VALIDATION_LEVEL,
  PackageVersionBuilder,
  VersionStatus,
  VersionValidationLevel,
} from '../../src/processor'
import { LocalRegistry, VersionOverrideRegistry } from './registry'
import { Editor } from './editor'
import { takeIfDefined } from '../../src/utils'

export const BEFORE_VERSION_ID = 'v1'

export const AFTER_VERSION_ID = 'v2'

const DEFAULT_DASHBOARD_ID = 'dashboards/dashboard'

// Every changelog wrapper asks for the same thing: compare this package's `v2` against its own `v1`.
const changelogConfig = (packageId: string): BuildConfig => ({
  version: AFTER_VERSION_ID,
  packageId,
  previousVersionPackageId: packageId,
  previousVersion: BEFORE_VERSION_ID,
  buildType: BUILD_TYPE.CHANGELOG,
  status: VERSION_STATUS.RELEASE,
})

export async function buildChangelogPackage(
  packageId: string,
  filesBefore: BuildConfigFile[] = [{ fileId: 'before.yaml' }],
  filesAfter: BuildConfigFile[] = [{ fileId: 'after.yaml' }],
  // the pair's own status: a fixture that carries an Error publishes as a draft, and the changelog over it
  // is what the test is about
  status: VersionStatus = VERSION_STATUS.RELEASE,
): Promise<BuildResult> {
  const pkg = LocalRegistry.openPackage(packageId)

  await pkg.publish(packageId, { packageId, version: BEFORE_VERSION_ID, files: filesBefore, status })
  await pkg.publish(packageId, { packageId, version: AFTER_VERSION_ID, files: filesAfter, status })

  return new Editor(packageId, changelogConfig(packageId)).run()
}

export async function buildPrefixGroupChangelogPackage(options: {
  packageId: string
  config?: Partial<BuildConfig>
}): Promise<BuildResult> {
  const {
    packageId,
    config: {
      files = [{ fileId: 'spec.yaml' }],
      currentGroup = '/api/v2/',
      previousGroup = '/api/v1/',
    } = {},
  } = options

  const pkg = LocalRegistry.openPackage(packageId)

  await pkg.publish(packageId, {
    packageId,
    version: BEFORE_VERSION_ID,
    files,
  })

  const editor = new Editor(packageId, {
    version: BEFORE_VERSION_ID,
    packageId,
    currentGroup,
    previousGroup,
    buildType: BUILD_TYPE.PREFIX_GROUPS_CHANGELOG,
    status: VERSION_STATUS.RELEASE,
  })
  return await editor.run()
}

export async function buildGqlChangelogPackage(
  packageId: string,
): Promise<BuildResult> {
  return buildChangelogPackage(packageId, [{ fileId: 'before.gql' }], [{ fileId: 'after.gql' }])
}

export async function buildPackage(
  packageId: string,
): Promise<BuildResult> {
  const registry = LocalRegistry.openPackage(packageId)
  const editor = await Editor.openProject(packageId, registry)
  await registry.publish(packageId, { packageId })
  return editor.run({
    version: BEFORE_VERSION_ID,
    status: VERSION_STATUS.RELEASE,
    buildType: BUILD_TYPE.BUILD,
  })
}

/**
 * Publish two packages at `v1` and `v2`, and a dashboard at both versions referencing both of them.
 *
 * Distinct from `prepareChangelogDashboard`, which gives each dashboard version a single reference: here every
 * version of the dashboard carries both, so a comparison of `v1` against `v2` produces a pair per reference.
 * That is what a test needs to fail one reference and watch what the aggregate does.
 */
export async function publishDashboardWithTwoRefs(
  packageId1: string,
  packageId2: string,
  dashboardPackageId: string = DEFAULT_DASHBOARD_ID,
): Promise<LocalRegistry> {
  for (const version of [BEFORE_VERSION_ID, AFTER_VERSION_ID]) {
    await LocalRegistry.openPackage(packageId1).publish(packageId1, { version, packageId: packageId1, files: [{ fileId: 'v1.yaml' }] })
    await LocalRegistry.openPackage(packageId2).publish(packageId2, { version, packageId: packageId2, files: [{ fileId: 'v2.yaml' }] })
  }

  const dashboard = LocalRegistry.openPackage(dashboardPackageId)
  for (const version of [BEFORE_VERSION_ID, AFTER_VERSION_ID]) {
    await dashboard.publish(dashboardPackageId, {
      packageId: dashboardPackageId,
      version,
      apiType: 'rest',
      refs: [{ refId: packageId1, version }, { refId: packageId2, version }],
    })
  }
  return dashboard
}

export async function buildChangelogDashboard(
  packageId1: string,
  packageId2: string,
): Promise<BuildResult> {
  const editor = await prepareChangelogDashboard(packageId1, packageId2)
  return editor.run()
}

export async function prepareChangelogDashboard(
  packageId1: string,
  packageId2: string,
): Promise<Editor> {
  await LocalRegistry.openPackage(packageId1).publish(packageId1, {
    packageId: packageId1,
    version: BEFORE_VERSION_ID,
    files: [{ fileId: 'v1.yaml' }],
  })
  await LocalRegistry.openPackage(packageId2).publish(packageId2, {
    packageId: packageId2,
    version: AFTER_VERSION_ID,
    files: [{ fileId: 'v2.yaml' }],
  })

  const dashboard = LocalRegistry.openPackage(DEFAULT_DASHBOARD_ID)
  await dashboard.publish(DEFAULT_DASHBOARD_ID, {
    packageId: DEFAULT_DASHBOARD_ID,
    version: BEFORE_VERSION_ID,
    apiType: 'rest',
    refs: [
      { refId: packageId1, version: BEFORE_VERSION_ID },
    ],
  })

  await dashboard.publish(DEFAULT_DASHBOARD_ID, {
    packageId: DEFAULT_DASHBOARD_ID,
    version: AFTER_VERSION_ID,
    apiType: 'rest',
    refs: [
      { refId: packageId2, version: AFTER_VERSION_ID },
    ],
  })

  return new Editor(DEFAULT_DASHBOARD_ID, changelogConfig(DEFAULT_DASHBOARD_ID))
}

export async function buildPackageWithDefaultConfig(
  packageId: string,
  fileLabels?: Labels,
  versionLabels?: Labels,
  xApiKind?: string,
): Promise<BuildResult> {
  const portal = new LocalRegistry(packageId)
  const file = {
    fileId: 'spec.yaml',
    ...takeIfDefined({ labels: fileLabels }),
    ...takeIfDefined({ xApiKind: xApiKind }),
  }

  await portal.publish(packageId, {
    packageId: packageId,
    version: 'v1',
    metadata: { ...takeIfDefined({ versionLabels: versionLabels }) },
    files: [{ ...file, publish: true }],
  })

  const editor = new Editor(packageId, {
    packageId: packageId,
    version: 'v1',
    status: VERSION_STATUS.RELEASE,
    buildType: BUILD_TYPE.BUILD,
    metadata: { ...takeIfDefined({ versionLabels: versionLabels }) },
    files: [file],
  }, {}, portal)

  return editor.run()
}

export async function buildPackageFromContent(
  packageId: string,
  fileId: string,
  content: string,
  fileLabels?: Labels,
  versionLabels?: Labels,
  xApiKind?: string,
): Promise<BuildResult> {
  const portal = new LocalRegistry(packageId)
  return portal.publishFromContent(
    { [fileId]: content },
    {
      packageId,
      version: 'v1',
      metadata: { ...takeIfDefined({ versionLabels: versionLabels }) },
      files: [{
        fileId,
        publish: true,
        ...takeIfDefined({ labels: fileLabels }),
        ...takeIfDefined({ xApiKind: xApiKind }),
      }],
    },
  )
}

export async function buildChangelogFromContent(
  packageId: string,
  beforeContent: string,
  afterContent: string,
  fileLabels?: Labels,
): Promise<BuildResult> {
  const portal = new LocalRegistry(packageId)

  await portal.publishFromContent(
    { 'before.yaml': beforeContent },
    {
      packageId: packageId,
      version: BEFORE_VERSION_ID,
      files: [{ fileId: 'before.yaml', publish: true, ...takeIfDefined({ labels: fileLabels }) }],
    },
  )
  await portal.publishFromContent(
    { 'after.yaml': afterContent },
    {
      packageId: packageId,
      version: AFTER_VERSION_ID,
      files: [{ fileId: 'after.yaml', ...takeIfDefined({ labels: fileLabels }) }],
    },
  )

  return new Editor(packageId, changelogConfig(packageId)).run()
}

const DEFAULT_SPEC = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Test', version: '1.0' },
  paths: { '/test': { get: { operationId: 'getTest', responses: { '200': { description: 'OK' } } } } },
})

export async function buildChangelogWithVersionOverrides(
  packageId: string,
  overrides: Record<string, string>,
  validationLevel: VersionValidationLevel = VERSION_VALIDATION_LEVEL.MAJOR,
): Promise<BuildResult> {
  return buildWithVersionOverrides(packageId, overrides, { validationLevel })
}

export async function buildWithVersionOverrides(
  packageId: string,
  overrides: Record<string, string>,
  {
    validationLevel = VERSION_VALIDATION_LEVEL.MAJOR,
    buildType = BUILD_TYPE.CHANGELOG,
    status = VERSION_STATUS.RELEASE,
  }: {
    validationLevel?: VersionValidationLevel
    buildType?: BuildType
    status?: VersionStatus
  } = {},
): Promise<BuildResult> {
  const registry = new VersionOverrideRegistry(packageId)
  for (const [version, value] of Object.entries(overrides)) {
    registry.overrideApiProcessorVersion(version, value)
  }

  await registry.publishFromContent(
    { 'spec.json': DEFAULT_SPEC },
    { packageId, version: 'v1', files: [{ fileId: 'spec.json', publish: true }] },
  )
  await registry.publishFromContent(
    { 'spec.json': DEFAULT_SPEC },
    { packageId, version: 'v2', files: [{ fileId: 'spec.json' }] },
  )

  const config: BuildConfig = {
    version: 'v2',
    packageId,
    previousVersionPackageId: packageId,
    previousVersion: 'v1',
    buildType,
    status,
    // a changelog config carries no files, a build config lists what it publishes
    ...buildType === BUILD_TYPE.BUILD ? { files: [{ fileId: 'spec.json' }] } : {},
  }

  const builder = new PackageVersionBuilder(config, {
    resolvers: {
      // a changelog reads no source files; a build reads the same spec the version was published from
      fileResolver: (fileId) => Promise.resolve(
        fileId === 'spec.json' ? new File([DEFAULT_SPEC], fileId, { type: 'application/json' }) : null,
      ),
      ...registry.versionResolvers,
    },
  })
  return builder.run({ apiProcessorVersionValidationLevel: validationLevel })
}
