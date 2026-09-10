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
  setHabitWeight: (habitId: number, weight: number) =>
    ipcRenderer.invoke('set-habit-weight', habitId, weight),
  setHabitTarget: (habitId: number, targetPerWeek: number | null) =>
    ipcRenderer.invoke('set-habit-target', habitId, targetPerWeek),
  updateHabitDetails: (habitId: number, name: string, color: string) =>
    ipcRenderer.invoke('update-habit-details', habitId, name, color),
  updateHabitLog: (habitId: number, date: string, state: number) =>
    ipcRenderer.invoke('update-habit-log', habitId, date, state),
  removeHabit: (habitId: number) => ipcRenderer.invoke('remove-habit', habitId),
  reorderHabits: (orderedIds: number[]) => ipcRenderer.invoke('reorder-habits', orderedIds),
  archiveHabit: (habitId: number) => ipcRenderer.invoke('archive-habit', habitId),
  unarchiveHabit: (habitId: number) => ipcRenderer.invoke('unarchive-habit', habitId),
  saltExists: () => ipcRenderer.invoke('salt-exists'),
  dbExists: () => ipcRenderer.invoke('db-exists'),
  createDatabase: (password: string) => ipcRenderer.invoke('create-database', password),
  unlockDatabase: (password: string) => ipcRenderer.invoke('unlock-database', password)
})
