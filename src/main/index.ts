import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { randomBytes, pbkdf2Sync } from 'crypto'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  addHabit,
  archiveHabit,
  getAllHabitLogs,
  getAllHabits,
  createEncryptedDatabase,
  openEncryptedDatabase,
  removeHabit,
  reorderHabits,
  setHabitTarget,
  setHabitWeight,
  unarchiveHabit,
  updateHabit,
  updateHabitDetails,
  updateHabitLog
} from './db'

const KDF_ITERATIONS = 100_000
const KDF_KEY_LENGTH = 32
const SALT_LENGTH = 32
const MIN_PASSWORD_LENGTH = 8

let salt_file: string
let db_file: string

// In-memory brute-force throttle for the unlock flow. Reset on a successful
// unlock; grows the forced delay after each consecutive failure.
let failedUnlockAttempts = 0

function saltExists(): boolean {
  return existsSync(salt_file)
}

function dbExists(): boolean {
  return existsSync(db_file)
}

function getOrCreateSalt(): Buffer {
  if (saltExists()) return readFileSync(salt_file)
  const salt = randomBytes(SALT_LENGTH)
  writeFileSync(salt_file, salt)
  return salt
}

function deriveKey(password: string, salt: Buffer): string {
  return pbkdf2Sync(password, salt, KDF_ITERATIONS, KDF_KEY_LENGTH, 'sha256').toString('base64')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

if (is.dev) {
  app.setPath('userData', join(app.getPath('appData'), app.name + '-dev'))
} else {
  app.setPath('userData', join(app.getPath('appData'), app.name))
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (is.dev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Only hand off ordinary web links to the OS browser; block everything else
    // (file:, custom schemes, etc.).
    try {
      const { protocol } = new URL(details.url)
      if (protocol === 'https:' || protocol === 'http:') {
        shell.openExternal(details.url)
      }
    } catch {
      // malformed URL - ignore
    }
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows (must match electron-builder appId).
  electronApp.setAppUserModelId('com.electron.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  salt_file = join(app.getPath('userData'), '.salt')
  db_file = join(app.getPath('userData'), 'database.sqlite')

  // IPC: onboarding state
  ipcMain.handle('salt-exists', () => saltExists())
  ipcMain.handle('db-exists', () => dbExists())

  // IPC: create the encrypted database from a password. The derived key never
  // leaves the main process.
  ipcMain.handle('create-database', async (_, password: string) => {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return {
        success: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      }
    }
    if (dbExists()) {
      return { success: false, error: 'Database already exists' }
    }

    try {
      const key = deriveKey(password, getOrCreateSalt())
      createEncryptedDatabase(db_file, key)
      failedUnlockAttempts = 0
      return { success: true }
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create database'
      }
    }
  })

  // IPC: unlock the existing encrypted database with a password.
  ipcMain.handle('unlock-database', async (_, password: string) => {
    if (!dbExists() || !saltExists()) {
      return { success: false, error: 'Database does not exist' }
    }
    if (typeof password !== 'string' || password.length === 0) {
      return { success: false, error: 'Password cannot be empty' }
    }

    // Escalating delay after repeated failures (capped at 5s).
    if (failedUnlockAttempts > 0) {
      await delay(Math.min(failedUnlockAttempts * 500, 5000))
    }

    try {
      const key = deriveKey(password, readFileSync(salt_file))
      openEncryptedDatabase(db_file, key)
      failedUnlockAttempts = 0
      return { success: true }
    } catch {
      failedUnlockAttempts++
      return { success: false, error: 'Incorrect password provided' }
    }
  })

  // IPC: database actions
  ipcMain.handle('get-all-habits', () => getAllHabits())

  ipcMain.handle('get-all-habit-logs', () => getAllHabitLogs())

  ipcMain.handle('add-habit', (_, name: string, color: string) => addHabit(name, color))

  ipcMain.handle(
    'update-habit',
    (
      _,
      habitId: number,
      current_streak: number,
      longest_streak: number,
      completion_rate: number
    ) => {
      return updateHabit(habitId, current_streak, longest_streak, completion_rate)
    }
  )

  ipcMain.handle('set-habit-weight', (_, habitId: number, weight: number) => {
    return setHabitWeight(habitId, weight)
  })

  ipcMain.handle('set-habit-target', (_, habitId: number, targetPerWeek: number | null) => {
    return setHabitTarget(habitId, targetPerWeek)
  })

  ipcMain.handle('update-habit-details', (_, habitId: number, name: string, color: string) => {
    return updateHabitDetails(habitId, name, color)
  })

  ipcMain.handle('update-habit-log', (_, habitId: number, date: string, state: number) => {
    return updateHabitLog(habitId, date, state)
  })

  ipcMain.handle('remove-habit', (_, habitId: number) => removeHabit(habitId))

  ipcMain.handle('reorder-habits', (_, orderedIds: number[]) => reorderHabits(orderedIds))

  ipcMain.handle('archive-habit', (_, habitId: number) => archiveHabit(habitId))

  ipcMain.handle('unarchive-habit', (_, habitId: number) => unarchiveHabit(habitId))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
