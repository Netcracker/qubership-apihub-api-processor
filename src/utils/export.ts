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
import { ZippableDocument } from '../types'
import { UNKNOWN_API_TYPE } from '../apitypes'
import path from 'path'
import fs from 'fs/promises'
import { getDocumentTitle } from './document'

export async function createCommonStaticExportDocuments(packageId: string, version: string, addBackLink: boolean = false): Promise<ZippableDocument[]> {
  return [
    createExportDocument('ls.html', await generateLegalStatementPage(packageId, version, addBackLink)),
    createExportDocument('resources/corporatelogo.svg', new Blob([await fs.readFile(path.join(__dirname, '..', '..', 'templates', 'resources', 'corporatelogo.svg'))])),
    createExportDocument('resources/styles.css', new Blob([await fs.readFile(path.join(__dirname, '..', '..', 'templates', 'resources', 'styles.css'))])),
  ]
}

export function createExportDocument(fileId: string, source: Blob): ZippableDocument {
  return {
    fileId: fileId,
    type: UNKNOWN_API_TYPE,
    data: '',
    description: '',
    publish: true,
    filename: fileId,
    source: source,
  }
}

export async function generateLegalStatementPage(packageId: string, version: string, addBackLink: boolean): Promise<Blob> {
  const template = await fs.readFile(path.join(__dirname, '..', '..', 'templates', 'ls.html'), 'utf-8')
  const breadcrumbs = addBackLink ? '<div class="breadcrumbs"><a href="index.html">Back</a></div>' : ''
  const filled = template
    // todo use packageName instead of packageId
    .replace('{{packageName}}', packageId)
    .replace('{{version}}', version)
    .replace('{{breadcrumbs}}', breadcrumbs)
    // todo use packageName instead of packageId
    .replace('{{packageNameAndVersion}}', `${packageId} ${version}`)
  return new Blob([filled])
}

export async function generateHtmlPage(document: string, fileTitle: string, packageId: string, version: string, addBackLink: boolean = false): Promise<Blob> {
  const template = await fs.readFile(path.join(__dirname, '..', '..', 'templates', 'page.html'), 'utf-8')
  const apispecViewScript = await fs.readFile(path.join(__dirname, '..', '..', 'templates', 'scripts', 'apispec-view.js'), 'utf-8')
  const breadcrumbs = addBackLink ? `<div class="breadcrumbs"><a href="index.html">Table of contents</a> > <span>${fileTitle}</span></div>` : ''
  const filled = template
    .replace('{{fileTitle}}', fileTitle)
    .replace('{{apispecViewScript}}', () => apispecViewScript)
    // todo use packageName instead of packageId
    .replace('{{packageName}}', packageId)
    .replace('{{version}}', version)
    .replace('{{breadcrumbs}}', breadcrumbs)
    .replace('{{spec}}', document)
    // todo use packageName instead of packageId
    .replace('{{packageNameAndVersion}}', `${packageId} ${version}`)
  return new Blob([filled])
}

async function generateReadmeParts(readme?: string): Promise<[string, string]> {
  if (!readme) {
    return ['', '']
  }
  const markdownIt = await fs.readFile(path.join(__dirname, '..', '..', 'templates', 'scripts', 'markdown-it.min.js'), 'utf-8')
  const readmeHtml = '    <div id="readmeMdDiv" class="card content">\n        <div class="card content"></div>\n    </div>\n    <br>\n    <script>\n        var md = window.markdownit();\n        let temp=md.render(`${readme}`);\n        const readmeMdDiv = document.getElementById(\'readmeMdDiv\');\n        readmeMdDiv.innerHTML=temp;\n    </script>'
  return [readmeHtml, `<script>${markdownIt}</script>`]
}

export async function generateIndexHtmlPage(packageId: string, version: string, generatedHtmlExportDocuments: ZippableDocument[], readme?: string): Promise<Blob> {
  const template = await fs.readFile(path.join(__dirname, '..', '..', 'templates', 'index.html'), 'utf-8')
  const htmlList = generatedHtmlExportDocuments.reduce(
    (acc, { filename }) => acc.concat(`        <li><a href="${filename}">${getDocumentTitle(filename)}</a></li>\n`),
    '',
  )

  const [readmeHtml, markdownItScript] = await generateReadmeParts(readme)

  const filled = template
    // todo use packageName instead of packageId
    .replaceAll('{{packageName}}', packageId)
    .replace('{{markdownItScript}}', markdownItScript)
    .replace('{{version}}', version)
    .replace('{{readmeHtml}}', readmeHtml)
    .replace('{{htmlList}}', htmlList)
    // todo use packageName instead of packageId
    .replace('{{packageNameAndVersion}}', `${packageId} ${version}`)
  return new Blob([filled])
}

export function createSingleFileExportName(packageId: string, version: string, documentTitle: string, format: string): string {
  return `${packageId}_${version}_${documentTitle}.${format}`
}
