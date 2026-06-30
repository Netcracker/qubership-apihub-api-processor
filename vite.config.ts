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
      // Two entries: the light root (parser-free) and the heavy '/processor'
      // (the spec-processing engine, which pulls the ddlapi parser). Shared light
      // code is hoisted into a common chunk; the parser/WASM graph stays only in
      // the processor entry's chunks.
      entry: {
        'api-processor': path.resolve(__dirname, 'src/index.ts'),
        'api-processor-engine': path.resolve(__dirname, 'src/processor.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.es.js`,
    },
    rollupOptions: {
      // Keep ddlapi (and its parser chain) external so the consuming bundler/runtime
      // resolves it: the browser handles WASM via its own asset pipeline, Node reads
      // libpg-query.wasm from node_modules. We no longer bundle/inline the WASM here.
      external: [
        '@asyncapi/parser',
        /^@netcracker\/qubership-apihub-ddlapi(\/.*)?$/,
        /^(libpg-query|pgsql-parser|pgsql-deparser)(\/.*)?$/,
      ],
    },
  },
  resolve: {
    alias: {
      // Use browser-compatible version of AsyncAPI parser
      '@asyncapi/parser': '@asyncapi/parser/browser',
    },
  },
})
