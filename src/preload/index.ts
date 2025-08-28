import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('habitAPI', {
  getAllHabits: () => ipcRenderer.invoke('get-all-habits'),
  getAllHabitLogs: () => ipcRenderer.invoke('get-all-habit-logs'),
  addHabit: (name: string, color: string) => ipcRenderer.invoke('add-habit', name, color),
  updateHabit: (
    habitId: number,
    current_streak: number,
    longest_streak: number,
    completion_rate: number
  ) => ipcRenderer.invoke('update-habit', habitId, current_streak, longest_streak, completion_rate),
  updateHabitLog: (habitId: number, date: string, state: number) =>
    ipcRenderer.invoke('update-habit-log', habitId, date, state),
  removeHabit: (habitId: number) => ipcRenderer.invoke('remove-habit', habitId),
  saltExists: () => ipcRenderer.invoke('salt-exists'),
  dbExists: () => ipcRenderer.invoke('db-exists'),
  getKdfSalt: () => ipcRenderer.invoke('get-kdf-salt'),
  createSalt: () => ipcRenderer.invoke('create-salt'),
  deriveKey: (password: string) => ipcRenderer.invoke('derive-key', password),
  createEncryptedDb: (key: string) => ipcRenderer.invoke('create-encrypted-db', key),
  openEncryptedDb: (key: string) => ipcRenderer.invoke('open-encrypted-db', key)
})
