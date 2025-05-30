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

export async function createCommonStaticExportDocuments(): Promise<ZippableDocument[]> {
  return [
    createExportDocument('ls.html', new Blob([await fs.readFile(path.join(__dirname, '..', '..', 'templates', 'ls.html'))])),
    createExportDocument('resources/corporatelogo.png', new Blob([await fs.readFile(path.join(__dirname, '..', '..', 'templates', 'resources', 'corporatelogo.png'))])),
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

export async function createHtmlDocument(document: string, title: string, packageId: string, version: string): Promise<Blob> {
  const template = await fs.readFile(path.join(__dirname, '..', '..', 'templates', 'single_page.html'), 'utf-8')
  const apispecViewScript = await fs.readFile(path.join(__dirname, '..', '..', 'templates', 'scripts', 'apispec-view.js'), 'utf-8')
  const filled = template
    .replace('{{title}}', title)
    .replace('{{apispecViewScript}}', () => apispecViewScript)
    // todo use packageName instead of packageId
    .replace('{{packageName}}', packageId)
    .replace('{{version}}', version)
    .replace('{{spec}}', document)
    // todo use packageName instead of packageId
    .replace('{{packageNameAndVersion}}', `${packageId} ${version}`)
  return new Blob([filled])
}

export async function generateIndexHtmlDocument(packageId: string, version: string, generatedHtmlExportDocuments: ZippableDocument[]): Promise<Blob> {
  const template = await fs.readFile(path.join(__dirname, '..', '..', 'templates', 'index.html'), 'utf-8')
  const htmlList = generatedHtmlExportDocuments.reduce(
    (acc, { filename }) => acc.concat(`        <li><a href="${filename}">${getDocumentTitle(filename)}</a></li>\n`),
    '',
  )
  const filled = template
    // todo use packageName instead of packageId
    .replaceAll('{{packageName}}', packageId)
    .replace('{{version}}', version)
    // todo add mdJs and readmeHtml if needed
    .replace('{{htmlList}}', htmlList)
    // todo use packageName instead of packageId
    .replace('{{packageNameAndVersion}}', `${packageId} ${version}`)
  return new Blob([filled])
}

export function createSingleFileExportName(packageId: string, version: string, documentTitle: string, format: string): string {
  return `${packageId}_${version}_${documentTitle}.${format}`
}
