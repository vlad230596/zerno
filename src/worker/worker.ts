import type { EndpointPreference } from '../6-shared/api/zenmoney/endpoints'
import * as Comlink from 'comlink'
import { TDiff, TLocalData, TZmDiff } from '../6-shared/types'
import { keys } from '../6-shared/helpers/keys'
import { storage } from '../6-shared/api/storage'
import { zenmoney } from '../6-shared/api/zenmoney'
import { convertDiff } from '../6-shared/api/zm-adapter'

type LocalKey = keyof TLocalData
const LOCAL_KEYS = [
  'serverTimestamp',
  'instrument',
  'user',
  'merchant',
  'country',
  'company',
  'reminder',
  'reminderMarker',
  'account',
  'tag',
  'budget',
  'transaction',
] as LocalKey[]

/**
 * Changes made in this browser that the server has not confirmed yet.
 *
 * Kept apart from the snapshot under `LOCAL_KEYS`: that one is the server's
 * state and gets rewritten by every sync, while this is what lies on top of
 * it. Restoring what the user sees needs both. Stored in client format,
 * exactly as the store holds it, so nothing is reinterpreted on the way back.
 */
const PENDING_DIFF_KEY = 'pendingDiff'
/** Bump to ignore everything written by an older format. */
const PENDING_DIFF_VERSION = 1

function convertZmToLocal(diff: TZmDiff) {
  return convertDiff.toClient(diff)
}

async function getPendingDiff(): Promise<TDiff | null> {
  const stored = await storage.get(PENDING_DIFF_KEY)
  if (!stored || stored.version !== PENDING_DIFF_VERSION) return null
  return (stored.diff as TDiff) || null
}

async function savePendingDiff(diff?: TDiff) {
  const value = diff ? { version: PENDING_DIFF_VERSION, diff } : null
  return storage.set(PENDING_DIFF_KEY, value)
}

async function sync(
  token: string,
  preference: EndpointPreference,
  diff: TDiff
) {
  const zmDiff = convertDiff.toServer(diff)
  try {
    let data = await zenmoney.fetchDiff(token, preference, zmDiff)
    return { data: convertDiff.toClient(data) }
  } catch (error: any) {
    return { error: error.message as string }
  }
}

async function getLocalData() {
  let data = {} as TLocalData
  let arr = await Promise.all(LOCAL_KEYS.map(key => storage.get(key)))
  LOCAL_KEYS.forEach((key, i) => (data[key] = arr[i]))
  return convertDiff.toClient(data)
}

const obj = {
  convertZmToLocal,
  getLocalData,
  getPendingDiff,
  savePendingDiff,
  clearStorage: () => storage.clear(),
  saveLocalData: (data: TLocalData) => {
    keys(data).forEach(key => storage.set(key, data[key]))
  },
  sync,
}

export type WorkerObj = typeof obj
Comlink.expose(obj)
