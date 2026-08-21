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

import type { BuildConfigFile, BuilderContext, BuildFileResult, SourceFile, VersionDocument } from '../types'
import { buildDocument, buildErrorDocument } from './document'
import { MESSAGE_CATEGORY, MESSAGE_SEVERITY } from '../consts'
import { REST_DOCUMENT_TYPE } from '../apitypes/rest/rest.consts'
import { MessageSeverity } from '../types/package/notifications'
import { DocumentBuildError } from '../errors'
import { FILE_KIND } from '../types'
import { isNotEmpty, SLUG_OPTIONS_DOCUMENT_ID, slugify } from '../utils'

export const createFileSlugs = (files: BuildConfigFile[], basePath: string): BuildConfigFile[] => {
  const { fs, slugs } = files.reduce(({ fs, slugs }, file) => {
    if (file.slug && !slugs.includes(file.slug)) {
      return { fs, slugs: [...slugs, file.slug] }
    } else {
      return { fs: [...fs, file], slugs }
    }
  }, { fs: [], slugs: [] } as { fs: BuildConfigFile[]; slugs: string[] })

  for (const file of fs) {
    const filename = file.fileId.substring(basePath.length).trim()
    const name = filename.substring(filename.startsWith('.') ? 1 : 0).replace(/\.[^/.]+$/, '')
    file.slug = slugify(name, SLUG_OPTIONS_DOCUMENT_ID, slugs)
    slugs.push(file.slug)
  }

  return files
}

export const buildFile = async (configFile: BuildConfigFile, ctx: BuilderContext): Promise<BuildFileResult> => {
  // Built on a copy: the entry of the build config outlives the build, and an incremental rebuild
  // hands the very same one over again, so what the build writes must not stay on it
  const file = { ...configFile }
  const data = await ctx.parsedFileResolver(file.fileId)

  if (!data) {
    ctx.notifications.push({
      category: MESSAGE_CATEGORY.FileNotParsed,
      severity: MESSAGE_SEVERITY.Error,
      message: 'File was not parsed',
      documentId: file.slug,
    })
    return {
      file,
      document: buildErrorDocument(file),
    }
  }

  // A document that fails to build no longer costs the version: it is published as a placeholder carrying its
  // original bytes, and the reason is recorded against it
  try {
    const result = await buildDocument(data, file, ctx)
    await reportParseErrors(result.document, data, ctx)
    return { file, document: result.document, builder: result.builder }
  } catch (error) {
    ctx.notifications.push({
      category: error instanceof DocumentBuildError ? error.category : MESSAGE_CATEGORY.BuildDocument,
      severity: MESSAGE_SEVERITY.Error,
      message: error instanceof Error ? error.message : 'Cannot build document',
      documentId: file.slug,
    })
    // every parsed file carries its bytes, binary fallbacks included — the placeholder keeps them
    const document = buildErrorDocument(file, data)
    // the parse complaints are often why it threw, and this is the only site that emits them
    await reportParseErrors(document, data, ctx)
    return { file, document }
  }
}

/**
 * Report the parse problems of the document's own file and of every file it bundled, attributed to this
 * document's slug.
 *
 * A `$ref`-ed file has no slug of its own — it never becomes a document — but it is always pulled in by one
 * that does, and that document's bundle is what ends up broken. Reporting here (rather than in `parseFile`,
 * which caches by fileId and would emit once) means a file referenced by two documents flags both.
 */
async function reportParseErrors(document: VersionDocument, own: SourceFile, ctx: BuilderContext): Promise<void> {
  report(own, true)

  for (const dependency of document.dependencies ?? []) {
    const parsed = await ctx.parsedFileResolver(dependency)
    if (parsed) { report(parsed, false) }
  }

  function report(file: SourceFile, isOwn: boolean): void {
    for (const error of file.errors ?? []) {
      ctx.notifications.push({
        // a parser that threw leaves a binary fallback; one that returned complaints leaves a text file
        category: file.kind === FILE_KIND.BINARY ? MESSAGE_CATEGORY.ParseFile : MESSAGE_CATEGORY.InvalidTextFile,
        severity: parseErrorSeverity(file, error),
        message: parseErrorMessage(file, isOwn, error?.message),
        documentId: document.slug,
      })
    }
  }
}

/**
 * Severity comes from the parser, not from this site: one constant covered three of them, and they disagree.
 * REST complaints are AJV metaschema nitpicking on documents that parse and build; MCP complaints are
 * structural and make the document unusable; AsyncAPI carries its own diagnostic severity. A parser that
 * threw outright leaves a binary fallback, and that is an Error whatever produced it.
 */
function parseErrorSeverity(file: SourceFile, error: { severity?: number } | undefined): MessageSeverity {
  if (file.kind === FILE_KIND.BINARY) { return MESSAGE_SEVERITY.Error }
  // only a value the contract defines: the consumer rejects the whole archive over an unknown severity
  if (KNOWN_SEVERITIES.has(error?.severity as number)) { return error!.severity as MessageSeverity }
  return REST_DOCUMENT_TYPES.has(file.type) ? MESSAGE_SEVERITY.Warning : MESSAGE_SEVERITY.Error
}

const KNOWN_SEVERITIES = new Set<number>(Object.values(MESSAGE_SEVERITY))

const REST_DOCUMENT_TYPES = new Set<string>(Object.values(REST_DOCUMENT_TYPE))

// The offending fileId has to be in the text when the file is a dependency: the notification is attached to a
// different document, and the path is what the reader opens. It never goes into `documentId`.
function parseErrorMessage(file: SourceFile, isOwn: boolean, detail: string | undefined): string {
  const reason = detail ? ` ${detail}` : ''
  if (file.kind === FILE_KIND.BINARY) {
    return isOwn
      ? `Cannot parse file ${file.fileId}.${reason}`
      : `Cannot parse file '${file.fileId}' referenced from this document.${reason}`
  }
  return isOwn
    ? `Invalid ${file.type} file.${reason}`
    : `Invalid ${file.type} file '${file.fileId}' referenced from this document.${reason}`
}

export const buildFiles = async (files: BuildConfigFile[], ctx: BuilderContext): Promise<BuildFileResult[]> => {

  files = createFileSlugs(files, ctx.basePath)

  const tasks = []

  for (const file of files) {
    if (!file.fileId) { continue }
    tasks.push(
      buildFile(file, ctx),
    )
  }

  const result = await Promise.all(tasks)

  // A file reached through a `$ref` is not a document of its own, so it is not published unless the config
  // asks for it. Except when its parser threw: that is the file the publisher has to open, and suppressing
  // it would drop the bytes with it.
  const dependencies = new Set(result.flatMap(({ document }) => document.dependencies))
  for (const { document } of result) {
    if (document.publish !== undefined || !dependencies.has(document.fileId)) {
      document.publish = document.publish ?? true
      continue
    }
    const parsed = await ctx.parsedFileResolver(document.fileId)
    document.publish = parsed?.kind === FILE_KIND.BINARY && isNotEmpty(parsed.errors ?? [])
  }

  return result
}
