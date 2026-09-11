/**
 * Names of the IndexedDB database the application shares with the service
 * worker. They live apart from `6-shared/config` because that module reads
 * `import.meta.env`, and the service worker is built by a separate Rollup pass
 * that does not resolve the application's environment.
 */
export const idbBaseName = 'zerro_data'
export const idbStoreName = 'serverData'
