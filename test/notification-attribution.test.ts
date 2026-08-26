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

import { afterEach, describe, expect, jest, test } from '@jest/globals'
import JSZip from 'jszip'
import {
  buildChangelogPackage,
  Editor,
  loadFileAsStringFromRegistry,
  LocalRegistry,
  publishDashboardWithTwoRefs,
  VERSIONS_PATH,
} from './helpers'
import { BUILD_TYPE, MESSAGE_CATEGORY, MESSAGE_SEVERITY, PACKAGE, VERSION_STATUS } from '../src/consts'
import { BuildConfig, BuildResult, MessageSeverity } from '../src/types'
import { buildComparisonNotifications } from '../src/components/build-result-index'
import { toVersionsComparisonDto } from '../src/utils/transformToDto'
import { PackageVersionBuilder } from '../src/builder'

// Whole-result invariants over the notification contract. They hold for every build, so any raising site
// that forgets a category or ships a fileId where a slug belongs fails here rather than in production.
describe('Notification attribution invariants', () => {
  const publish = (projectId: string, files: string[]): Promise<BuildResult> => {
    const pkg = LocalRegistry.openPackage(projectId)
    return pkg.publish(pkg.packageId, {
      packageId: pkg.packageId,
      version: 'v1',
      files: files.map(fileId => ({ fileId })),
    })
  }

  const CASES: Array<[string, () => Promise<BuildResult>]> = [
    // a document whose references do not resolve — the `ref-*` family comes from this one site
    ['broken references', () => LocalRegistry.openPackage('reference-bundling/case2').publish('reference-bundling/case2')],
    // a path that fails validation — `double-slash-path`
    ['invalid paths', () => publish('operationId-collisions/double-slash-in-path', ['spec.json'])],
    // the same operationId in two documents — `duplicate-operation-id`, the one cross-document case today
    ['duplicate operation ids', () => publish('operationId-collisions/same-path-different-documents', ['spec1.json', 'spec2.json'])],
  ]

  const KNOWN_CATEGORIES = new Set<string>(Object.values(MESSAGE_CATEGORY))

  test.each(CASES)('should carry a known category on every notification — %s', async (_name, build) => {
    const result = await build()

    expect(result.notifications.length).toBeGreaterThan(0)
    for (const { category } of result.notifications) {
      expect(KNOWN_CATEGORIES.has(category)).toBe(true)
    }
  })

  test.each(CASES)('should use a document slug for every documentId — %s', async (_name, build) => {
    const result = await build()
    const slugs = new Set([...result.documents.values()].map(({ slug }) => slug))

    for (const { documentId } of result.notifications) {
      if (documentId === undefined) { continue }
      expect(slugs.has(documentId)).toBe(true)
    }
  })

  // the release-failure message relies on this: an attributed error always has a document to name
  test.each(CASES)('should attribute every build-phase Error to a document — %s', async (_name, build) => {
    const result = await build()

    const unattributed = result.notifications.filter(
      ({ severity, documentId }) => severity === MESSAGE_SEVERITY.Error && documentId === undefined,
    )
    expect(unattributed).toEqual([])
  })
})

// The invariants above run on the in-memory result. The archive is what actually ships, and a message can be
// routed correctly and still never be serialised — so assert them again on the published files.
describe('Notification invariants hold in the published archive', () => {
  test('should categorise every notification in notifications.json and name a real document', async () => {
    const pkg = LocalRegistry.openPackage('operationId-collisions/same-path-different-documents')
    await pkg.publish(pkg.packageId, {
      packageId: pkg.packageId,
      version: 'v1',
      files: [{ fileId: 'spec1.json' }, { fileId: 'spec2.json' }],
    })

    const versionPath = `${pkg.packageId}/v1`
    const notifications = JSON.parse(
      (await loadFileAsStringFromRegistry(VERSIONS_PATH, versionPath, 'notifications.json'))!,
    ).notifications as Array<{ category: string; severity: number; documentId?: string }>
    const documents = JSON.parse(
      (await loadFileAsStringFromRegistry(VERSIONS_PATH, versionPath, 'documents.json'))!,
    ).documents as Array<{ slug: string }>

    const slugs = new Set(documents.map(({ slug }) => slug))
    const known = new Set<string>(Object.values(MESSAGE_CATEGORY))

    expect(notifications.length).toBeGreaterThan(0)
    for (const notification of notifications) {
      expect(known.has(notification.category)).toBe(true)
      expect(notification).not.toHaveProperty('fileId')
      if (notification.severity === MESSAGE_SEVERITY.Error) {
        expect(notification.documentId).toBeDefined()
      }
      if (notification.documentId !== undefined) {
        expect(slugs.has(notification.documentId)).toBe(true)
      }
    }
  }, 30000)

  test('should keep notifications out of comparisons.json — they live in their own file', async () => {
    const result = await buildChangelogPackage('changelog/security/operation-security-precedence/both-change')
    expect(result.comparisons.length).toBeGreaterThan(0)

    // the DTO deliberately drops the field; a leak would duplicate the dedicated file, unsorted
    const dto = toVersionsComparisonDto(result.comparisons[0], new WeakMap(), () => undefined)
    expect(dto).not.toHaveProperty('notifications')
  })
})

// The two streams are separated by which context produced the message, not by a decision at the call site.
describe('Notification stream routing', () => {
  test('should mark the comparison, not the version, when the previous version is missing', async () => {
    const pkg = LocalRegistry.openPackage('reference-bundling/case2')
    await pkg.publish(pkg.packageId, { packageId: pkg.packageId, version: 'v1' })

    const editor = new Editor(pkg.packageId, {
      packageId: pkg.packageId,
      version: 'v1',
      previousVersion: 'no-such-version',
      buildType: BUILD_TYPE.CHANGELOG,
      status: VERSION_STATUS.NONE,
    }, {}, pkg)
    const result = await editor.run()

    // the baseline could not be resolved — a comparison problem, so it belongs to the comparison stream, and
    // within it to the pair whose baseline it is: the build-level array reaches no file
    expect(result.comparisons.flatMap(({ notifications }) => notifications).map(({ category }) => category))
      .toContain(MESSAGE_CATEGORY.VersionNotResolved)
    expect(result.comparisonNotifications).toEqual([])
    expect(result.notifications.map(({ category }) => category))
      .not.toContain(MESSAGE_CATEGORY.VersionNotResolved)
  })

  test('should empty the arrays in place so a context built earlier keeps writing to the live one', async () => {
    const pkg = LocalRegistry.openPackage('reference-bundling/case2')
    const builder = new PackageVersionBuilder(
      { packageId: pkg.packageId, version: 'v1', status: VERSION_STATUS.RELEASE, buildType: BUILD_TYPE.BUILD },
      { resolvers: {} } as never,
    )

    const { notifications, comparisonNotifications } = builder
    builder.clearCaches()

    expect(builder.notifications).toBe(notifications)
    expect(builder.comparisonNotifications).toBe(comparisonNotifications)
  })
})

// Every comparison-phase message belongs to exactly one version pair, so each comparison owns its array.
describe('Comparison notifications belong to a version pair', () => {
  afterEach(() => { jest.restoreAllMocks() })

  // A pair's operation and DDL comparisons resolve the same versions, so the failure arrives twice. Each
  // pair still reports independently — what must not happen is the same pair reporting twice, which would
  // double the count in the release-failure message and store two identical rows.
  test('should report one unresolvable baseline once per pair, not once per comparison kind', async () => {
    const packageId = 'attribution/no-duplicate-resolver-failure'
    const registry = new LocalRegistry(packageId)
    await registry.publish('declarative-changes-in-rest-operation/case1', {
      packageId, version: 'v2', files: [{ fileId: 'after.yaml' }],
    })

    const result = await new Editor(packageId, {
      packageId,
      version: 'v2',
      previousVersionPackageId: packageId,
      previousVersion: 'no-such-version',
      buildType: BUILD_TYPE.CHANGELOG,
      status: VERSION_STATUS.DRAFT,
    } as never, {}, registry).run()

    for (const { notifications } of result.comparisons) {
      const perPair = notifications.filter(({ category }) => category === MESSAGE_CATEGORY.VersionNotResolved)
      expect(perPair.length).toBeLessThanOrEqual(1)
    }
  }, 60000)

  // One version reached by several pairs is reported by each of them. This works because the resolvers cache
  // successes only, so the second pair calls the host again instead of inheriting a cached miss.
  //
  // The message has to be a Warning to be observable at all: an `Error` on a reference comparison aborts the
  // dashboard build (`ref-comparison-has-errors`), so a multi-pair `Error` never reaches an archive.
  test('should report the same unresolvable version from every pair that hits it', async () => {
    const dashboard = await publishDashboardWithTwoRefs('dashboards/pckg1', 'dashboards/pckg2')

    // the baseline side of every pair loses its documents at once
    const original = (LocalRegistry.prototype as unknown as { versionDocumentsResolver: unknown }).versionDocumentsResolver
    jest.spyOn(LocalRegistry.prototype, 'versionDocumentsResolver')
      .mockImplementation(async function (this: LocalRegistry, version: string, ...rest: unknown[]) {
        if (version === 'v1') { return null }
        return (original as (...a: unknown[]) => Promise<unknown>).call(this, version, ...rest)
      } as never)

    const result = await new Editor(dashboard.packageId, {
      packageId: dashboard.packageId,
      version: 'v2',
      previousVersionPackageId: dashboard.packageId,
      previousVersion: 'v1',
      buildType: BUILD_TYPE.CHANGELOG,
      status: VERSION_STATUS.DRAFT,
    } as never, {}, dashboard).run()

    const reporting = result.comparisons.filter(({ notifications }) =>
      notifications.some(({ category }) => category === MESSAGE_CATEGORY.VersionDocumentsMissing))
    expect(reporting.length).toBeGreaterThan(1)

    // each pair carries its own copy rather than sharing one array
    expect(new Set(reporting.map(({ notifications }) => notifications)).size).toBe(reporting.length)
  }, 60000)

  test('should give each comparison its own array rather than a shared one', async () => {
    const result = await buildChangelogPackage('changelog/security/operation-security-precedence/both-change')

    expect(result.comparisons.length).toBeGreaterThan(0)
    for (const comparison of result.comparisons) {
      expect(Array.isArray(comparison.notifications)).toBe(true)
      // aliasing the build-level array would put another pair's messages on this comparison
      expect(comparison.notifications).not.toBe(result.comparisonNotifications)
      expect(comparison.notifications).not.toBe(result.notifications)
    }

    const arrays = new Set(result.comparisons.map(({ notifications }) => notifications))
    expect(arrays.size).toBe(result.comparisons.length)
  })

  // Enumerating a pair's references happens before any reference pair exists, but the references being
  // enumerated are this pair's — so the failure belongs to it. Reported on the build-level array instead, the
  // message would reach no file: only per-pair arrays are serialized.
  test('should land a failure to enumerate references on the root pair, not the build-level array', async () => {
    const packageId = 'attribution/refs-not-resolved'
    const registry = new LocalRegistry(packageId)
    for (const version of ['v1', 'v2']) {
      await registry.publish('declarative-changes-in-rest-operation/case1', {
        packageId, version, files: [{ fileId: 'after.yaml' }],
      })
    }

    // the host cannot list this version's references
    jest.spyOn(LocalRegistry.prototype, 'versionReferencesResolver').mockResolvedValue(null as never)

    const editor = new Editor(packageId, {
      packageId,
      version: 'v2',
      previousVersionPackageId: packageId,
      previousVersion: 'v1',
      buildType: BUILD_TYPE.CHANGELOG,
      status: VERSION_STATUS.DRAFT,
    } as never, {}, registry)
    const result = await editor.run()

    const raised = result.comparisons.flatMap(({ notifications }) => notifications)
      .filter(({ category }) => category === MESSAGE_CATEGORY.VersionRefsNotResolved)
    expect(raised.length).toBeGreaterThan(0)
    expect(result.comparisonNotifications).toEqual([])
  }, 30000)
})

// The file groups by version pair; a flat list could not say which comparison a message belongs to.
describe('comparison-notifications.json', () => {
  test('should group by version pair and keep an entry per pair', () => {
    const pair = {
      packageId: 'shop', version: 'v3', revision: 3,
      previousVersionPackageId: 'shop', previousVersion: 'v2', previousVersionRevision: 7,
    }
    const shared = [{ category: MESSAGE_CATEGORY.VersionNotResolved, severity: MESSAGE_SEVERITY.Error, message: 'no such version' }]

    // the pair's operation and DDL comparisons share one array — they must collapse into one entry
    const grouped = buildComparisonNotifications([
      { ...pair, notifications: shared },
      { ...pair, notifications: shared },
      { ...pair, version: 'v4', notifications: [] },
      // resolved from the backend: no entry at all, or republish would wipe its stored rows
      { ...pair, version: 'v5', fromCache: true, notifications: [] },
    ] as never)

    // one entry per calculated pair, cached ones omitted
    expect(grouped.comparisons.map(({ version }) => version)).toEqual(['v3', 'v4'])
    // the pair identity and its messages, and nothing else: the comparison it came from carries the changelog
    expect(Object.keys(grouped.comparisons[0]).sort())
      .toEqual(['notifications', 'packageId', 'previousVersion', 'previousVersionPackageId', 'previousVersionRevision', 'revision', 'version'])
    expect(grouped.comparisons.find(entry => entry.version === 'v3')).toMatchObject({ ...pair, notifications: shared })
    expect(grouped.comparisons.find(entry => entry.version === 'v4')?.notifications).toEqual([])
  })

  // A baseline that does not resolve skips the changelog, so the failure has no comparison to travel on. It
  // still has a pair — the one the config asked for — and without the row it reaches no file at all.
  test('should row a message under the declared pair when the comparison never ran', async () => {
    const pkg = LocalRegistry.openPackage('tolerant-publication')
    const result = await pkg.publish(pkg.packageId, {
      status: VERSION_STATUS.DRAFT,
      previousVersion: 'no-such-version',
    } as never)
    expect(result.comparisons).toEqual([])

    const file = JSON.parse(
      (await loadFileAsStringFromRegistry(VERSIONS_PATH, `${pkg.packageId}/v1`, 'comparison-notifications.json'))!,
    ) as { comparisons: Array<{ previousVersion: string; notifications: Array<{ category: string }> }> }

    expect(file.comparisons).toHaveLength(1)
    expect(file.comparisons[0].previousVersion).toBe('no-such-version')
    expect(file.comparisons[0].notifications.map(({ category }) => category))
      .toEqual([MESSAGE_CATEGORY.VersionNotResolved])

    // the version's own file stays clear of it: a baseline is the comparison's problem, not the version's
    const notifications = JSON.parse(
      (await loadFileAsStringFromRegistry(VERSIONS_PATH, `${pkg.packageId}/v1`, 'notifications.json'))!,
    ).notifications as Array<{ category: string }>
    expect(notifications.map(({ category }) => category)).not.toContain(MESSAGE_CATEGORY.VersionNotResolved)
  }, 30000)
})


// AsyncAPI operation ids are `<operation>-<message>` and REST ones are `<path>-<method>`, so two api types
// can land on the same id. They do not share a severity — AsyncAPI kept `Error`, REST is deferred to
// `Warning` — and only one of the two documents can be the second to arrive.
// The two files are not both written every time: a build with no baseline has no comparison to report on, and
// a consumer that replaces a version's rows from the archive must not be handed an empty list to replace them
// with. Which file exists is part of the contract, not an implementation detail.
describe('Which notification files a build writes', () => {
  const PACKAGE_ID = 'reference-bundling/case1'

  const entriesOf = async (editor: Editor): Promise<string[]> => {
    const zip = await JSZip.loadAsync(await editor.createVersionPackage())
    return Object.keys(zip.files).filter(name => !zip.files[name].dir)
  }

  const build = (registry: LocalRegistry, config: Record<string, unknown>): Editor =>
    new Editor(PACKAGE_ID, {
      packageId: PACKAGE_ID,
      status: VERSION_STATUS.DRAFT,
      buildType: BUILD_TYPE.BUILD,
      files: [{ fileId: 'openapi.yaml' }],
      ...config,
    } as BuildConfig, {}, registry)

  const publishBaseline = async (registry: LocalRegistry): Promise<void> => {
    await registry.publish(PACKAGE_ID, {
      packageId: PACKAGE_ID, version: 'v1', files: [{ fileId: 'openapi.yaml' }],
    } as BuildConfig)
  }

  test('should write no comparison file for a build with no baseline', async () => {
    const editor = build(LocalRegistry.openPackage(PACKAGE_ID), { version: 'v1' })
    await editor.run()

    const entries = await entriesOf(editor)
    expect(entries).toContain(PACKAGE.NOTIFICATIONS_FILE_NAME)
    expect(entries).not.toContain(PACKAGE.COMPARISON_NOTIFICATIONS_FILE_NAME)
  }, 60000)

  test('should write both files for a build that declares a previous version', async () => {
    const registry = LocalRegistry.openPackage(PACKAGE_ID)
    await publishBaseline(registry)

    const editor = build(registry, { version: 'v2', previousVersion: 'v1' })
    await editor.run()

    const entries = await entriesOf(editor)
    expect(entries).toContain(PACKAGE.NOTIFICATIONS_FILE_NAME)
    expect(entries).toContain(PACKAGE.COMPARISON_NOTIFICATIONS_FILE_NAME)
  }, 60000)

  test('should write the comparison file for a standalone changelog', async () => {
    const registry = LocalRegistry.openPackage(PACKAGE_ID)
    await publishBaseline(registry)

    const editor = build(registry, { version: 'v2', previousVersion: 'v1', buildType: BUILD_TYPE.CHANGELOG })
    await editor.run()

    expect(await entriesOf(editor)).toContain(PACKAGE.COMPARISON_NOTIFICATIONS_FILE_NAME)
  }, 60000)
})

describe('A duplicate id shared by two api types', () => {
  const REST = `openapi: 3.0.1
info: { title: t, version: 1.0.0 }
paths:
  /pets:
    get:
      responses:
        '200': { description: ok }
`
  const ASYNC = `asyncapi: 3.0.0
info: { title: t, version: 1.0.0 }
channels:
  c1:
    address: c1
    messages:
      get: { payload: { type: object } }
operations:
  pets:
    action: receive
    channel: { $ref: '#/channels/c1' }
    messages:
      - $ref: '#/channels/c1/messages/get'
`

  const severitiesFor = async (packageId: string, fileIds: string[]): Promise<MessageSeverity[]> => {
    const registry = LocalRegistry.openPackage('reference-bundling/case2')
    const result = await registry.publishFromContent({ 'api.yaml': REST, 'async.yaml': ASYNC }, {
      packageId,
      version: 'v1',
      status: VERSION_STATUS.DRAFT,
      buildType: BUILD_TYPE.BUILD,
      files: fileIds.map(fileId => ({ fileId })),
    } as BuildConfig)

    expect([...result.operations.keys()]).toEqual(['pets-get'])
    return result.notifications
      .filter(({ category }) => category === MESSAGE_CATEGORY.DuplicateOperationId)
      .map(({ severity }) => severity)
  }

  // `config.files` order decides which document is processed second; it must not decide whether the release
  // is refused. The REST side is staged at `Warning` until the published population is clean, so a mixed pair
  // reports at `Warning` whichever way round the two arrive.
  test('should keep the same severity whichever document is processed first', async () => {
    const restFirst = await severitiesFor('duplicate-severity/rest-first', ['api.yaml', 'async.yaml'])
    const asyncFirst = await severitiesFor('duplicate-severity/async-first', ['async.yaml', 'api.yaml'])

    expect(restFirst).toEqual([MESSAGE_SEVERITY.Warning, MESSAGE_SEVERITY.Warning])
    expect(asyncFirst).toEqual(restFirst)
  }, 60000)

  // and the collision AsyncAPI has with itself keeps the `Error` it used to abort the build with
  test('should report a collision between two AsyncAPI documents as an Error', async () => {
    const registry = LocalRegistry.openPackage('reference-bundling/case2')
    const result = await registry.publishFromContent({ 'a.yaml': ASYNC, 'b.yaml': ASYNC }, {
      packageId: 'duplicate-severity/async-only',
      version: 'v1',
      status: VERSION_STATUS.DRAFT,
      buildType: BUILD_TYPE.BUILD,
      files: [{ fileId: 'a.yaml' }, { fileId: 'b.yaml' }],
    } as BuildConfig)

    expect(result.notifications
      .filter(({ category }) => category === MESSAGE_CATEGORY.DuplicateOperationId)
      .map(({ severity }) => severity)).toEqual([MESSAGE_SEVERITY.Error, MESSAGE_SEVERITY.Error])
  }, 60000)
})

describe('Identifier ownership', () => {
  test('should not list on the losing document the id the winner owns', async () => {
    const pkg = LocalRegistry.openPackage('operationId-collisions/same-path-different-documents')
    const result = await pkg.publish(pkg.packageId, {
      packageId: pkg.packageId,
      version: 'v1',
      files: [{ fileId: 'spec1.json' }, { fileId: 'spec2.json' }],
    })

    const winner = result.operations.get('res-data-post')
    expect(winner?.documentId).toBe('spec1')

    const documents = [...result.documents.values()]
    const owner = documents.find(({ slug }) => slug === 'spec1')
    const loser = documents.find(({ slug }) => slug === 'spec2')
    expect(owner?.operationIds).toContain('res-data-post')
    expect(loser?.operationIds).not.toContain('res-data-post')
  })

  test('should attribute every announced id back to the announcing document', async () => {
    const pkg = LocalRegistry.openPackage('operationId-collisions/same-path-different-documents')
    const result = await pkg.publish(pkg.packageId, {
      packageId: pkg.packageId,
      version: 'v1',
      files: [{ fileId: 'spec1.json' }, { fileId: 'spec2.json' }],
    })

    for (const document of result.documents.values()) {
      for (const operationId of document.operationIds ?? []) {
        expect(result.operations.get(operationId)?.documentId).toBe(document.slug)
      }
    }
  })
})

