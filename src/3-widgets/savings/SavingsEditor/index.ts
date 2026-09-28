// Contract between the savings page and its dialogs. The page only calls these
// hooks; the dialogs own their state and rendering and are mounted once in
// `1-app/GlobalWidgets` (`SavingsDialogs`), like the other global popovers.

/** `useSavingsEditor(): (accountId) => void` — opens the savings parameters dialog for an account. */
export { useSavingsEditor } from './SavingsEditor'
/** `useSavingsSettings(): () => void` — opens the savings settings dialog (АСВ limit, people's names). */
export { useSavingsSettings } from './SavingsSettings'
export { SavingsDialogs } from './Dialogs'
