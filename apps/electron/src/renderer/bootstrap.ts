/**
 * Install Host boot globals the Electron renderer needs before AppWebEntry runs.
 * Mirrors Host `injectBootManifest` without loading the Harness HTML document.
 */

const CLIENT_MODULES_ID = '@deepseek-ai/dsh-client-modules'

type QueueLoader = {
  mode: 'queue'
  pendingQueue: Array<{ id: string; factory: (require: (specifier: string) => unknown) => unknown }>
  load(registration: { id: string; factory: (require: (specifier: string) => unknown) => unknown }): void
  create(options: unknown): unknown
}

/**
 * Fetch Host bootstrap through the preload bridge and install `__ModuleLoader__` + `__DSH_BOOT__`.
 */
export async function installHostBootstrap(): Promise<void> {
  const bridge = window.deepseekDesktop
  if (bridge === undefined) {
    throw new Error('desktop bootstrap: window.deepseekDesktop is missing')
  }
  const { boot, preloadUrls } = await bridge.host.getBootstrap()
  installModuleLoaderFacade()
  await loadClassicScripts(preloadUrls)
  const win = window as Window & { __DSH_BOOT__?: unknown }
  win.__DSH_BOOT__ = boot
}

/** Install the queue-mode `__ModuleLoader__` facade matching Host HTML injection. */
function installModuleLoaderFacade(): void {
  const pendingQueue: QueueLoader['pendingQueue'] = []
  const target: QueueLoader = {
    mode: 'queue',
    pendingQueue,
    load(registration) {
      pendingQueue.push(registration)
    },
    create(options) {
      if (this.mode !== 'queue') {
        throw new Error('client-modules: window.__ModuleLoader__.create called after module-system boot')
      }
      const index = pendingQueue.findIndex(registration => registration.id === CLIENT_MODULES_ID)
      const registration = pendingQueue[index]
      if (registration === undefined) {
        throw new Error(`client-modules: HTML did not preload ${CLIENT_MODULES_ID}/client.js`)
      }
      pendingQueue.splice(index, 1)
      const exports = registration.factory((specifier) => {
        throw new Error(
          `client-modules: ${CLIENT_MODULES_ID}/client.js requested external "${specifier}" before the module system existed`,
        )
      })
      if (
        typeof exports !== 'object'
        || exports === null
        || typeof (exports as { createClientModuleSystem?: unknown }).createClientModuleSystem !== 'function'
        || typeof (exports as { apply?: unknown }).apply !== 'function'
      ) {
        throw new Error(`client-modules: ${CLIENT_MODULES_ID}/client.js did not export the bootstrap module face`)
      }
      return (exports as {
        createClientModuleSystem: (
          loader: QueueLoader,
          bootstrap: { id: string; exports: unknown },
          options: unknown,
        ) => unknown
      }).createClientModuleSystem(this, { id: registration.id, exports }, options)
    },
  }
  ;(window as Window & { __ModuleLoader__?: QueueLoader }).__ModuleLoader__ = target
}

/**
 * Load Host classic preload scripts in order (modules, then runtime).
 * @param urls - Same-origin `/plugins/...` paths from Host HTML.
 */
function loadClassicScripts(urls: string[]): Promise<void> {
  return urls.reduce(
    (chain, url) => chain.then(() => loadClassicScript(url)),
    Promise.resolve(),
  )
}

function loadClassicScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.async = false
    el.src = url
    el.addEventListener('load', () => {
      el.remove()
      resolve()
    }, { once: true })
    el.addEventListener('error', () => {
      el.remove()
      reject(new Error(`desktop bootstrap: failed to load ${url}`))
    }, { once: true })
    document.head.append(el)
  })
}
