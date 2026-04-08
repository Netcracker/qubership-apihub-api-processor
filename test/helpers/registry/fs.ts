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

import { fs as memfsModule } from 'memfs'
import * as realFs from 'fs/promises'
import path from 'path'
import mime from 'mime-types'
import { getFileExtension } from '../../../src/utils'

/**
 * Set FS_MODE=disk to write build results to disk instead of memory.
 * Useful for debugging test output.
 *
 * Usage:
 *   npm run test:disk
 */
const FS_MODE = process.env.FS_MODE ?? 'memory'
const useDisk = FS_MODE === 'disk'

if (useDisk) {
  console.warn('[vfs] Running in DISK mode')
}

type FsPromises = typeof realFs

const vfs: FsPromises = useDisk
  ? realFs
  : memfsModule.promises as unknown as FsPromises

/**
 * Read a file from versions storage (vfs).
 * Mirrors loadFile() from ../utils.ts but reads through vfs.
 */
export async function vfsLoadFile(filePath: string, folder: string, fileName: string): Promise<File | null> {
  try {
    const fullPath = vfsPath(filePath, folder, fileName)
    const mediaType = mime.lookup(fileName) || (['graphql', 'gql'].includes(getFileExtension(fileName)) ? 'text/plain' : false)
    const buffer = await vfs.readFile(fullPath)
    return new File([buffer], fileName, { type: mediaType || '' })
  } catch (error) {
    return null
  }
}

/**
 * Read a file as string from versions storage (vfs).
 */
export async function vfsLoadFileAsString(filePath: string, folder: string, fileName: string): Promise<string | null> {
  return (await vfsLoadFile(filePath, folder, fileName))?.text() ?? null
}

/**
 * Read a JSON config from versions storage (vfs).
 */
export async function vfsLoadConfig(filePath: string, folder: string, filename?: string): Promise<any | null> {
  try {
    const fullPath = vfsPath(filePath, folder, filename ?? 'config.json')
    const file = await vfs.readFile(fullPath, 'utf8')
    return JSON.parse(file.toString())
  } catch (error) {
    return null
  }
}

/**
 * Build a path through vfs — absolute on disk, posix in memory.
 */
export function vfsPath(...segments: string[]): string {
  return useDisk
    ? path.resolve(process.cwd(), ...segments)
    : path.posix.join(...segments)
}

export { vfs }
