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

import { MessageCategory, NotificationMessage } from './types/package/notifications'

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

/**
 * A fatal failure of a `build` or `changelog` build, carrying what the build had reported before it failed. A
 * failed build writes no archive, so this is the only way its messages reach the client.
 *
 * It reads as the original error: every client reports a failure as `${error}`, so the name and message are the
 * original's and the original is the `cause`.
 */
export class NotificationsError extends Error {
  constructor(
    cause: unknown,
    readonly notifications: NotificationMessage[],
    readonly comparisonNotifications: NotificationMessage[],
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    // an empty name makes `${this}` the bare message, which is what `${cause}` gives for a non-Error throw
    this.name = cause instanceof Error ? cause.name : ''
  }
}
