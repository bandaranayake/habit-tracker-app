import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { randomBytes, pbkdf2Sync } from 'crypto'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  addHabit,
  getAllHabitLogs,
  getAllHabits,
  createEncryptedDatabase,
  openEncryptedDatabase,
  removeHabit,
  updateHabit,
  updateHabitLog
} from './db'

let salt_file
let db_file

function saltExists(): boolean {
  return existsSync(salt_file)
}

function dbExists(): boolean {
  return existsSync(db_file)
}

function deriveKey(password: string, salt: Buffer, iterations = 100_000): Buffer {
  return pbkdf2Sync(password, salt, iterations, 32, 'sha256')
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
    shell.openExternal(details.url)
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
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  salt_file = join(app.getPath('userData'), '.salt')
  db_file = join(app.getPath('userData'), 'database.sqlite')

  // IPC: check if .salt and db exist
  ipcMain.handle('salt-exists', () => saltExists())
  ipcMain.handle('db-exists', () => dbExists())

  // IPC: get or create salt
  ipcMain.handle('get-kdf-salt', () => {
    if (!saltExists()) return null
    return readFileSync(salt_file).toString('base64')
  })

  // IPC: create salt
  ipcMain.handle('create-salt', () => {
    if (!saltExists()) {
      const salt = randomBytes(32)
      writeFileSync(salt_file, salt)
      return salt.toString('base64')
    }
    return readFileSync(salt_file).toString('base64')
  })

  // IPC: derive key
  ipcMain.handle('derive-key', (_, password: string) => {
    if (!saltExists()) return null
    const salt = readFileSync(salt_file)
    const key = deriveKey(password, salt)
    return key.toString('base64')
  })

  // IPC: create encrypted DB with derived key
  ipcMain.handle('create-encrypted-db', async (_, key: string) => {
    try {
      createEncryptedDatabase(db_file, key)
      return { success: true }
    } catch (err: unknown) {
      let errorMessage = 'Failed to create DB'

      if (err instanceof Error) {
        errorMessage = err?.message
      }

      return { success: false, error: errorMessage }
    }
  })

  // IPC: open encrypted DB with derived key
  ipcMain.handle('open-encrypted-db', async (_, key: string) => {
    try {
      if (!dbExists()) throw new Error('Database does not exist')
      openEncryptedDatabase(db_file, key)
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: 'Incorrect password provided' }
    }
  })

  // IPC: database actions
  ipcMain.handle('get-all-habits', () => {
    return getAllHabits()
  })

  ipcMain.handle('get-all-habit-logs', () => {
    return getAllHabitLogs()
  })

  ipcMain.handle('add-habit', (_, name: string, color: string) => {
    return addHabit(name, color)
  })

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

  ipcMain.handle('update-habit-log', (_, habitId: number, date: string, state: number) => {
    return updateHabitLog(habitId, date, state)
  })

  ipcMain.handle('remove-habit', (_, habitId: number) => {
    return removeHabit(habitId)
  })

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

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
