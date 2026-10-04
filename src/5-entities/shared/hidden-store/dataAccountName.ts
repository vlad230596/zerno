/**
 * Title of the helper account that holds the hidden-store reminders. Apart
 * from `dataAccount.ts` so that the service worker, which resolves no path
 * aliases, can read it without pulling in the Redux store.
 */
export const DATA_ACC_NAME = '🤖 [Zerro Data]'
