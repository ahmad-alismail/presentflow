import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { protocol } from 'electron'

/**
 * The production renderer is served from `app://presentflow/` instead of `file://`:
 * a standard, secure origin gives us a working Cache API (offline model cache),
 * module workers, and cross-origin isolation for multi-threaded WASM.
 */
export const APP_SCHEME = 'app'
export const APP_ORIGIN = `${APP_SCHEME}://presentflow`

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
}

/** Headers that make the page cross-origin isolated (SharedArrayBuffer → threaded WASM). */
export const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true }
    }
  ])
}

export function handleAppScheme(rendererDir: string): void {
  const root = path.resolve(rendererDir)
  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url)
    const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
    const file = path.resolve(root, `.${rel}`)
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return new Response('Not found', { status: 404 })
    }
    const body = Readable.toWeb(fs.createReadStream(file)) as ReadableStream
    return new Response(body, {
      headers: {
        'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cross-Origin-Resource-Policy': 'same-origin',
        ...ISOLATION_HEADERS
      }
    })
  })
}
