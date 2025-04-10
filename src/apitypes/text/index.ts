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

import { buildTextDocument, dumpTextDocument } from './text.document'
import { TEXT_API_TYPE, TEXT_DOCUMENT_TYPE } from './text.consts'
import { parseTextFile } from './text.parser'
import { ApiBuilder } from '../../types'

export * from './text.consts'

export const textApiBuilder: ApiBuilder<string> = {
  apiType: TEXT_API_TYPE,
  types: [TEXT_DOCUMENT_TYPE.MARKDOWN],
  parser: parseTextFile,
  buildDocument: buildTextDocument,
  dumpDocument: dumpTextDocument,
}
