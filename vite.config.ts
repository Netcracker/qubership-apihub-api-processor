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

import * as path from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import copy from 'rollup-plugin-copy'

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
    copy({
      targets: [
        {
          src: 'templates',
          dest: [
            path.resolve('dist', 'cjs'),
            path.resolve('dist', 'esm'),
          ],
        },
      ],
      flatten: true,
      hook: 'writeBundle',
    }),
  ],
  build: {
    sourcemap: true,
    outDir: './dist/esm',
    minify: false,
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'ApiHubBuilder',
      formats: ['es', 'umd'],
      fileName: (format) => `apihub-builder.${format}.js`,
    },
  },
})
