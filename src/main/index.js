import { app, shell, BrowserWindow, nativeTheme, dialog } from 'electron'
import { join } from 'path'
import { initDb } from './db.js'
import { registerIpc } from './ipc.js'
import { registerMediaProtocol, attachMediaProtocolHandler } from './mediaProtocol.js'

// 커스텀 프로토콜은 app ready 이전에 등록해야 함
registerMediaProtocol()

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0F1115' : '#F5F6F8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 개발 중에는 dev 서버, 배포본에서는 빌드된 파일 로드
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  attachMediaProtocolHandler()

  try {
    initDb()
    registerIpc()
  } catch (e) {
    console.error('[startup] DB/IPC init failed:', e)
    dialog.showErrorBox(
      '앱을 시작하지 못했어요',
      `${e?.message || e}\n\n터미널에서 아래를 실행한 뒤 다시 시도해 주세요.\nnpm run postinstall\nnpm run dev`
    )
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
