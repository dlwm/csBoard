/**
 * @typedef {Object} ShellAdapter
 * @property {string} id
 * @property {'web'|'desktop'|'mobile'} kind
 * @property {(event: Event, input: 'file'|'native') => Promise<Array>} chooseFiles
 * @property {boolean} [demoParsing] False for the reduced mobile browser workspace.
 * @property {boolean} [mobile]
 * @property {boolean} [nativeFilePicker]
 * @property {boolean} [backgroundParsing]
 * @property {(files: Array) => Promise<void>} [releaseFiles]
 * @property {Object|null} [resources]
 * @property {Object|null} [maintenance]
 * @property {Object|null} [presentation]
 * @property {Object|null} [ai]
 */

/**
 * @typedef {Object} ParserAdapter
 * @property {string} id
 * @property {'worker'|'native'|'disabled'} execution
 * @property {'file'|'native'} input
 * @property {(jobs: Array) => number} concurrency
 * @property {(options: Object) => {promise: Promise<Object>, terminate: Function}} start
 * @property {Object} [cacheOwner] Required only for a host that persists results itself.
 */

/**
 * @typedef {Object} StorageAdapter
 * @property {string} id
 * @property {Object} cache Demo/round reads, inspection, listing, writes and deletion.
 * @property {{get: Function, put: Function}} records
 * @property {Object} [owner] Identity of the native storage host, when applicable.
 */

/**
 * @typedef {Object} PlatformAdapters
 * @property {ShellAdapter} shell
 * @property {StorageAdapter} storage
 * @property {ParserAdapter|'wasm'|'native'} parser
 * @property {Function} [compute]
 */
export {};
