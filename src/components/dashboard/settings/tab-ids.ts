/** Shared by the server page (reads `?tab=`) and the client tabs. Not a client module on purpose. */
export const SETTINGS_TABS = ["profile", "credits", "account"] as const;
export type SettingsTabId = (typeof SETTINGS_TABS)[number];
