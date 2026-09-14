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

import { MessageCategory } from './types/package/notifications'

/**
 * A build failure that knows which diagnostic it is. Thrown deep in an api-type builder and re-thrown by
 * `buildDocument`, it keeps its category all the way to the catch that turns it into a notification —
 * without it every nested failure would flatten into the generic `build-document`.
 */
export class DocumentBuildError extends Error {
  constructor(message: string, readonly category: MessageCategory) {
    super(message)
    this.name = 'DocumentBuildError'
  }
}
