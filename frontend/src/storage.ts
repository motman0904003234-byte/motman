/** Storage that works on web PWA and Capacitor native. */

async function getRaw(key: string): Promise<string | null> {
  try {
    const { Preferences } = await import('@capacitor/preferences')
    const r = await Preferences.get({ key })
    return r.value
  } catch {
    return localStorage.getItem(key)
  }
}

async function setRaw(key: string, value: string): Promise<void> {
  try {
    const { Preferences } = await import('@capacitor/preferences')
    await Preferences.set({ key, value })
  } catch {
    localStorage.setItem(key, value)
  }
}

export const appStorage = {
  get: getRaw,
  set: setRaw,
}