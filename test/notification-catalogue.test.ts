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
import { LocalRegistry } from './helpers'
import { BUILD_TYPE, MESSAGE_CATEGORY, MESSAGE_SEVERITY, VERSION_STATUS } from '../src/consts'
import { BuildConfig, BuildResult, MessageCategory, MessageSeverity, NotificationMessage } from '../src/types'

/**
 * One row per diagnostic a build can raise, with what raises it and what the publisher gets: the severity,
 * whether a document is named, and whether a release still publishes. A row is the reference for its
 * category, so a suite that reaches the same category from its own fixture need not restate any of it.
 *
 * The categories no row can reach are listed, with their reason, above `publish`.
 */

type Stream = 'build' | 'comparison'

interface Case {
  /** what the publisher did, as the test titles read it */
  name: string
  category: MessageCategory
  severity: MessageSeverity
  /** the message names the document it belongs to */
  attributed: boolean
  /** a release carrying it does not publish */
  blocksRelease: boolean
  stream?: Stream
  project: string
  config: Partial<BuildConfig>
  /** published from memory instead of the project's files */
  content?: Record<string, string>
  /** published as v1 first, for a diagnostic that only appears when there is something to compare against */
  baseline?: { content: Record<string, string>; config: Partial<BuildConfig> }
}

const MCP = { metadata: { mcpEndpoint: '/mcp' } }
const file = (fileId: string): { fileId: string } => ({ fileId })

const BROKEN_SWAGGER = `swagger: '2.0'
info:
  title: Broken Swagger
  version: 1.0.0
paths:
  /pets:
    get:
      responses:
        '200':
          description: ok
          schema:
            $ref: '#/definitions/Missing'
`

const REF_IN_OPERATION_POSITION = `openapi: 3.0.1
info:
  title: t
  version: 1.0.0
paths:
  /a:
    get:
      $ref: '#/components/schemas/Thing'
components:
  schemas:
    Thing:
      type: object
`

// an operation whose message is written inline: without a `$ref` the unifier stamps no reference key, so the
// message has no id and the operation cannot be built
const ASYNC_INLINE_MESSAGE = `asyncapi: 3.0.0
info: { title: t, version: 1.0.0 }
channels:
  c1:
    address: c1
    messages:
      M1: { payload: {} }
operations:
  'user/created':
    action: receive
    channel: { $ref: '#/channels/c1' }
    messages:
      - payload: {}
`

// the same document with the message referenced instead of written inline: it builds, so it can stand as a
// baseline for a version that drops AsyncAPI entirely
const ASYNC_REFERENCED_MESSAGE = ASYNC_INLINE_MESSAGE
  .replace('      - payload: {}', '      - $ref: \'#/channels/c1/messages/M1\'')

// a deprecated channel: the tolerant hash is stamped on schema and parameter nodes, never on a channel
const ASYNC_DEPRECATED_CHANNEL = `asyncapi: 3.0.0
info: { title: t, version: 1.0.0 }
channels:
  userSignedUp:
    address: user/signedup
    x-deprecated: true
    messages:
      UserSignedUp:
        payload: { type: object, properties: { id: { type: string } } }
operations:
  onUserSignedUp:
    action: receive
    channel: { $ref: '#/channels/userSignedUp' }
    messages:
      - $ref: '#/channels/userSignedUp/messages/UserSignedUp'
`

const REST_MINIMAL = `openapi: 3.0.1
info: { title: t, version: 1.0.0 }
paths:
  /pets:
    get:
      responses:
        '200': { description: ok }
`

// a removed enum value: the diff's normalized before-value is the removed scalar, not an object
const restWithEnum = (values: string): string => `openapi: 3.0.1
info: { title: t, version: 1.0.0 }
paths:
  /pets:
    post:
      operationId: addPet
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                kind: { type: string, enum: ${values} }
                legacy: { type: string, deprecated: true }
      responses:
        '200': { description: ok }
`

const CASES: Case[] = [
  {
    name: 'a file whose parser threw',
    category: MESSAGE_CATEGORY.ParseFile,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'reference-bundling/unparsable-reference',
    config: { files: [file('broken.yaml')] },
  },
  {
    name: 'a document the parser read but did not approve',
    category: MESSAGE_CATEGORY.InvalidTextFile,
    severity: MESSAGE_SEVERITY.Warning, attributed: true, blocksRelease: false,
    project: 'reference-bundling/shared-broken-reference',
    config: { files: [file('shared.yaml')] },
  },
  {
    name: 'a configured file the resolver cannot produce',
    category: MESSAGE_CATEGORY.FileNotParsed,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'tolerant-publication',
    config: { files: [file('rest.json'), file('no-such-file.yaml')] },
  },
  {
    name: 'a Swagger 2.0 document that fails conversion',
    category: MESSAGE_CATEGORY.SwaggerConversion,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'broken',
    // a Swagger 2.0 document whose conversion fails: the `$ref` target does not exist
    content: { 'swagger.yaml': BROKEN_SWAGGER },
    config: { files: [file('swagger.yaml')] },
  },
  {
    name: 'a $ref with sibling keys',
    category: MESSAGE_CATEGORY.RefHasSiblings,
    severity: MESSAGE_SEVERITY.Warning, attributed: true, blocksRelease: false,
    project: 'reference-bundling/description-override',
    config: { files: [file('openapi.yaml')], validationRulesSeverity: { brokenRefs: 'error' } },
  },
  {
    name: 'a $ref in a position the schema does not allow',
    category: MESSAGE_CATEGORY.RefNotAllowed,
    severity: MESSAGE_SEVERITY.Warning, attributed: true, blocksRelease: false,
    project: 'reference-bundling/case2',
    content: { 'spec.yaml': REF_IN_OPERATION_POSITION },
    config: { files: [file('spec.yaml')], validationRulesSeverity: { brokenRefs: 'error' } },
  },
  {
    name: 'a GraphQL introspection the builder cannot read',
    category: MESSAGE_CATEGORY.BuildDocument,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'reference-bundling/case2',
    content: { 'schema.json': '{"__schema": {"types": "not-an-array"}}' },
    config: { files: [file('schema.json')] },
  },
  {
    name: 'a $ref to a file that does not exist',
    category: MESSAGE_CATEGORY.RefNotFound,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'reference-bundling/case2',
    config: { files: [file('openapi.yaml')], validationRulesSeverity: { brokenRefs: 'error' } },
  },
  {
    name: 'a $ref to a file that is not text',
    category: MESSAGE_CATEGORY.RefNotValidFormat,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'reference-bundling/case6',
    config: { files: [file('openapi.yaml')], validationRulesSeverity: { brokenRefs: 'error' } },
  },
  {
    name: 'two REST operations of one document sharing an operationId',
    category: MESSAGE_CATEGORY.RestDuplicateOperation,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'operationId-collisions/same-operationId-same-document',
    config: { files: [file('spec.json')] },
  },
  {
    name: 'two AsyncAPI operations of one document sharing an operationId',
    category: MESSAGE_CATEGORY.AsyncDuplicateOperation,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'asyncapi-changes/operation/duplicate-within-document',
    config: { files: [file('spec.yaml')] },
  },
  {
    name: 'one operationId claimed by two documents',
    category: MESSAGE_CATEGORY.DuplicateOperationId,
    severity: MESSAGE_SEVERITY.Warning, attributed: true, blocksRelease: false,
    project: 'operationId-collisions/same-path-different-documents',
    config: { files: [file('spec1.json'), file('spec2.json')] },
  },
  {
    name: 'a path parameter with no name',
    category: MESSAGE_CATEGORY.EmptyPathParameter,
    severity: MESSAGE_SEVERITY.Warning, attributed: true, blocksRelease: false,
    project: 'operationId-collisions/empty-path-parameter-name',
    config: { files: [file('spec.json')] },
  },
  {
    name: 'a path with a double slash',
    category: MESSAGE_CATEGORY.DoubleSlashPath,
    severity: MESSAGE_SEVERITY.Warning, attributed: true, blocksRelease: false,
    project: 'operationId-collisions/double-slash-in-path',
    config: { files: [file('spec.json')] },
  },
  {
    name: 'DDL with an unresolved reference',
    category: MESSAGE_CATEGORY.DdlParseIssue,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'ddl-validation',
    content: { 'shop.sql': 'CREATE TABLE orders (id bigint PRIMARY KEY, uid bigint REFERENCES missing(id));' },
    config: { files: [file('shop.sql')] },
  },
  {
    name: 'the same table declared twice in one file',
    category: MESSAGE_CATEGORY.DdlDuplicateObject,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'ddl-validation',
    content: { 'shop.sql': 'CREATE TABLE users (id bigint PRIMARY KEY);\nCREATE TABLE users (id bigint PRIMARY KEY);' },
    config: { files: [file('shop.sql')] },
  },
  {
    name: 'the same table declared in two files',
    category: MESSAGE_CATEGORY.DdlDuplicateEntity,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'ddl-validation',
    content: {
      'a.sql': 'CREATE TABLE users (id bigint PRIMARY KEY);',
      'b.sql': 'CREATE TABLE users (id bigint PRIMARY KEY, email text);',
    },
    config: { files: [file('a.sql'), file('b.sql')] },
  },
  {
    name: 'two DDL tables whose ids collide',
    category: MESSAGE_CATEGORY.DdlEntityBuild,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'ddl-build',
    config: { files: [file('duplicate.sql')] },
  },
  {
    name: 'two MCP entities of one name in one document',
    category: MESSAGE_CATEGORY.McpEntityBuild,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'mcp-build',
    config: { files: [{ ...file('init.json'), ...MCP }, { ...file('tools-duplicate-name.json'), ...MCP }] },
  },
  {
    name: 'one MCP entity id claimed by two documents',
    category: MESSAGE_CATEGORY.McpDuplicateEntity,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'mcp-build',
    config: {
      files: [
        { ...file('init.json'), ...MCP },
        { ...file('tools-same-name.json'), ...MCP },
        { ...file('tools-same-name-2.json'), ...MCP },
      ],
    },
  },
  {
    name: 'an MCP document that fails its protocol schema',
    category: MESSAGE_CATEGORY.McpDocumentSchema,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'mcp-build',
    config: { files: [{ ...file('init.json'), ...MCP }, { ...file('tools-missing-inputschema.json'), ...MCP }] },
  },
  {
    name: 'an MCP endpoint published without an init',
    category: MESSAGE_CATEGORY.McpInitRequired,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'mcp-build',
    config: { files: [{ ...file('tools.json'), ...MCP }] },
  },
  {
    name: 'an MCP capability declared with no entities',
    category: MESSAGE_CATEGORY.McpCapabilityUnused,
    severity: MESSAGE_SEVERITY.Warning, attributed: true, blocksRelease: false,
    project: 'mcp-build',
    config: { files: [{ ...file('init.json'), ...MCP }, { ...file('tools.json'), ...MCP }] },
  },
  {
    name: 'an AsyncAPI operation whose message is inline',
    category: MESSAGE_CATEGORY.BuildOperations,
    severity: MESSAGE_SEVERITY.Error, attributed: true, blocksRelease: true,
    project: 'reference-bundling/case2',
    content: { 'async.yaml': ASYNC_INLINE_MESSAGE },
    config: { files: [file('async.yaml')] },
  },
  {
    name: 'a deprecated AsyncAPI channel, whose tolerant hash is never stamped',
    category: MESSAGE_CATEGORY.TolerantHashMissing,
    severity: MESSAGE_SEVERITY.Warning, attributed: true, blocksRelease: false,
    project: 'reference-bundling/case2',
    content: { 'async.yaml': ASYNC_DEPRECATED_CHANNEL },
    config: { files: [file('async.yaml')] },
  },
  {
    name: 'a version that added an api type its baseline does not have',
    category: MESSAGE_CATEGORY.VersionDocumentsMissing,
    severity: MESSAGE_SEVERITY.Warning, attributed: false, blocksRelease: false, stream: 'comparison',
    project: 'reference-bundling/case2',
    baseline: { content: { 'async.yaml': ASYNC_REFERENCED_MESSAGE }, config: { files: [file('async.yaml')] } },
    content: { 'api.yaml': REST_MINIMAL },
    config: { files: [file('api.yaml')], previousVersion: 'v1' },
  },
  {
    name: 'a removed enum value on an operation that carries a deprecated item',
    category: MESSAGE_CATEGORY.RiskyBeforeValue,
    severity: MESSAGE_SEVERITY.Warning, attributed: true, blocksRelease: false, stream: 'comparison',
    project: 'reference-bundling/case2',
    baseline: { content: { 'api.yaml': restWithEnum('[cat, dog]') }, config: { files: [file('api.yaml')] } },
    content: { 'api.yaml': restWithEnum('[cat]') },
    config: { files: [file('api.yaml')], previousVersion: 'v1' },
  },
  {
    name: 'a previous version that does not resolve',
    category: MESSAGE_CATEGORY.VersionNotResolved,
    severity: MESSAGE_SEVERITY.Error, attributed: false, blocksRelease: true, stream: 'comparison',
    project: 'tolerant-publication',
    config: { files: [file('rest.json')], previousVersion: 'no-such-version' },
  },
]

/*
 * The categories this table does not drive, and why.
 *
 * No document a publisher can write produces them: each needs a collaborator to fail — a resolver returning
 * nothing, a diff arriving malformed, a hash that throws. The suite that stubs that collaborator owns the case.
 *
 *   version-refs-not-resolved    notification-attribution.test.ts — host-conditional: the contract lets the
 *                                references resolver answer `null`, and `LocalRegistry` never does
 *   comparison-serialization     release-gate.test.ts — a violation of api-diff's output contract, not of
 *                                anything a document can say
 *   risky-origins                calculation-diagnostics.test.ts — needs origins to be absent, which the
 *                                comparison's own normalization always supplies
 *   tolerant-hash-failed         calculation-diagnostics.test.ts — the deferred hash has no input-shaped throw
 *   deprecated-component-path    calculation-diagnostics.test.ts — a `components`-rooted declaration path comes
 *                                from a `$ref` pointer, so its segments are always strings
 *
 * One belongs to a build type this table does not run:
 *
 *   group-documents-missing      document-group.test.ts — a group build, whose archive carries it like any
 *                                other; only the export build types return before `notifications.json`
 *
 * And two no build reaches at all:
 *
 *   operation-data-missing       `versionOperationsResolver` raises it only for `includeData`, and both call
 *                                sites in `compare.operations.ts` pass `false`. The wrapper's own default is
 *                                `true`, so a call site that omits the flag would start raising it.
 *   partial-group-documents      raised inside the branch that already found no documents, where
 *                                `[].every(...)` holds — so the partial case it names cannot reach it. It
 *                                fires only when the resolver answers `null`, and then it says the wrong
 *                                thing. Predates this change; the fix is to lift it out of that branch.
 */

const publish = async (testCase: Case, status: string): Promise<BuildResult> => {
  const packageId = `catalogue/${testCase.category}`
  const registry = LocalRegistry.openPackage(testCase.project)

  if (testCase.baseline) {
    await registry.publishFromContent(testCase.baseline.content, {
      packageId, version: 'v1', status: VERSION_STATUS.DRAFT, buildType: BUILD_TYPE.BUILD, ...testCase.baseline.config,
    } as BuildConfig)
  }

  const config = {
    packageId,
    version: testCase.baseline ? 'v2' : 'v1',
    status,
    buildType: BUILD_TYPE.BUILD,
    ...testCase.config,
  } as BuildConfig
  return testCase.content
    ? registry.publishFromContent(testCase.content, config)
    : registry.publish(testCase.project, config)
}

const raised = (result: BuildResult, stream: Stream = 'build'): NotificationMessage[] =>
  (stream === 'build'
    ? result.notifications
    : [...result.comparisonNotifications, ...result.comparisons.flatMap(({ notifications }) => notifications)])

describe('Every diagnostic a build can raise', () => {
  test.each(CASES)('should report $name', async (testCase) => {
    const draft = await publish(testCase, VERSION_STATUS.DRAFT)
    const [message] = raised(draft, testCase.stream).filter(({ category }) => category === testCase.category)

    expect(message).toBeDefined()
    expect(message.severity).toBe(testCase.severity)
    expect(!!message.documentId).toBe(testCase.attributed)
  }, 60000)

  test.each(CASES.map(testCase => ({ ...testCase, release: testCase.blocksRelease ? 'refuse' : 'publish' })))(
    'should $release a release carrying $name', async (testCase) => {
    const release = publish(testCase, VERSION_STATUS.RELEASE)

    if (testCase.blocksRelease) {
      await expect(release).rejects.toThrow(/You can publish version in draft status/)
    } else {
      await expect(release).resolves.toBeDefined()
    }
  }, 60000)
})
