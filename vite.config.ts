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

// Keep the DDL parser chain OUT of the bundled ESM/UMD build. @netcracker/qubership-apihub-ddlapi
// pulls in pgsql-parser → libpg-query, whose Emscripten glue fetches `libpg-query.wasm` at runtime
// via locateFile(). If this chain is inlined into apihub-builder.es.js it becomes a SECOND physical
// copy of libpg-query that the consumer's bundler (apihub-ui) can no longer reach with its
// optimizeDeps/locateFile transform — the wasm 404s ("expected magic word 00 61 73 6d"). Keeping it
// external lets the consumer resolve a SINGLE copy from node_modules (browser: optimized + locateFile
// -patched by Vite; Node/BTC: read straight from node_modules beside the loader). Only the dynamic
// import() in ddl.parser.ts reaches this chain, so externalising it leaves no static binding behind.
// (The tsc CJS output in dist/cjs, used via `require`, already keeps these as runtime imports.)
const PARSER_CHAIN_EXTERNALS = [
  '@netcracker/qubership-apihub-ddlapi',
  'pgsql-parser',
  'pgsql-deparser',
  'libpg-query',
  '@pgsql/types',
]
const isExternal = (id: string): boolean =>
  id === '@asyncapi/parser' ||
  PARSER_CHAIN_EXTERNALS.some((pkg) => id === pkg || id.startsWith(`${pkg}/`))

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
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
    rollupOptions: {
      external: isExternal,
      output: {
        // Map @asyncapi/parser to browser version in UMD builds
        paths: {
          '@asyncapi/parser': '@asyncapi/parser',
        },
      },
    },
  },
  resolve: {
    alias: {
      // Use browser-compatible version of AsyncAPI parser
      '@asyncapi/parser': '@asyncapi/parser/browser',
    },
  },
})
