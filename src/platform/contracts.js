/**
 * Runtime ports. A host is the application container; a driver implements a
 * replaceable infrastructure capability. IDs describe implementations, while
 * UI decisions use capabilities. Do not infer storage from parser IDs.
 * 运行契约：Host 为应用宿主，Driver 为可替换的基础能力实现。
 * ID 用于诊断；业务判断使用 capabilities，不从解析器名称推断存储方式。
 *
 * @typedef {Object} HostDriver
 * @property {string} id browser | electron | capacitor
 * @property {'web'|'desktop'|'mobile'} kind Presentation category only.
 * @property {(event: Event, input: 'file'|'native') => Promise<Array>} chooseFiles
 * @property {boolean} [demoParsing] Reduced browser hosts disable parsing.
 * @property {boolean} [mobile]
 * @property {boolean} [nativeFilePicker]
 * @property {boolean} [backgroundParsing] OS capability, not parser speed.
 * @property {boolean} [releaseDownload]
 * @property {{status: Function, check: Function, download: Function, cancel: Function, install: Function, preferences: Function, subscribe: Function}} [updates] Desktop update port; URLs and files remain in the host.
 * @property {(files: Array) => Promise<void>} [releaseFiles]
 * @property {Object|null} [resources]
 * @property {Object|null} [maintenance]
 * @property {Object|null} [presentation]
 * @property {Object|null} [ai]
 */

/**
 * @typedef {Object} ParserDriver
 * @property {string} id go-wasm | go-process | go-embedded | disabled
 * @property {'worker'|'native'|'disabled'} execution
 * @property {'file'|'native'} input File objects or host-owned source handles.
 * @property {(jobs: Array) => number} concurrency
 * start(options) accepts options.kind = 'match' | 'recording': match indexes
 * rounds for analysis; recording samples independent clips without analysis.
 * @property {(options: Object) => {promise: Promise<Object>, terminate: Function}} start
 * @property {Object} [cacheOwner] Host identity when parsing persists directly.
 */

/**
 * @typedef {Object} PreferenceStore
 * @property {string} id browser-preferences | sqlite-preferences
 * @property {() => Promise<void>} ready Hydrate before mounting the UI.
 * @property {(key: string) => string|null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 * @property {() => string[]} keys
 * @property {() => Promise<void>} flush Await pending durable writes.
 */

/**
 * @typedef {Object} StorageDriver
 * @property {string} id browser-storage | sqlite-storage
 * @property {Object} cache Demo metadata and round payload port.
 * @property {{get: Function, put: Function}} records Large application records.
 * @property {PreferenceStore} preferences Small UI preferences, never Demo data.
 * @property {Object} [owner] Identity of the backend that owns the cache.
 */

/**
 * @typedef {Object} ComputeDriver
 * @property {string} id web-worker | electron-worker
 * @property {(method: string, args: Object, options?: {signal?: AbortSignal}) => Promise<*>} run
 * @property {Object} [cacheOwner] Required storage host for backend-side queries.
 */

/**
 * @typedef {Object} PlatformDrivers
 * @property {HostDriver} host
 * @property {StorageDriver} storage
 * @property {ParserDriver} parser
 * @property {ComputeDriver} [compute] Selected independently of parser execution.
 */
export {};
