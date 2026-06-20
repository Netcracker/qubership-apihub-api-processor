import type { Plugin } from 'vite'

const LIBPG_QUERY_INDEX = /[/\\]libpg-query[/\\]wasm[/\\]index\.js$/

function patchLibpgQueryInit(source: string): string | null {
  if (/\.endsWith\(['"]\.wasm['"]\)/.test(source)) {
    return null
  }

  const locateFileArg = `{ locateFile: (file) => file.endsWith('.wasm') ? __libpgQueryWasmUrl : file }`
  const patched = source.replace('PgQueryModule()', `PgQueryModule(${locateFileArg})`)

  return patched === source ? null : patched
}

/**
 * libpg-query (Emscripten) loads libpg-query.wasm via locateFile. Vite resolves the
 * ?url import at build time (inlined data URL in the browser bundle) and wires locateFile.
 */
export function libpgQueryBrowserPlugin(): Plugin {
  return {
    name: 'libpg-query-browser',
    enforce: 'pre',
    transform: function(code, id) {
      if (!LIBPG_QUERY_INDEX.test(id)) {
        return null
      }

      const patched = patchLibpgQueryInit(code)
      if (!patched) {
        if (code.includes('PgQueryModule()')) {
          this.error({
            message: 'libpg-query wasm loader: expected PgQueryModule() call to patch',
            id: id,
          })
        }
        return null
      }

      return {
        code: `import __libpgQueryWasmUrl from 'libpg-query/wasm/libpg-query.wasm?url'\n${patched}`,
        map: null,
      }
    },
  }
}
