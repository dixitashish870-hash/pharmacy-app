const electron = require('electron');
const path = require('path');
const https = require('https');
const { app, BrowserWindow, ipcMain, shell, Notification, dialog } = electron;
const { autoUpdater } = require('electron-updater');
const isDev = !app?.isPackaged;

// ── Backend server ──────────────────────────────────────────────────────────
const { spawn } = require('child_process');
let serverProcess = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit'
});
app.on('will-quit', () => { if (serverProcess) serverProcess.kill(); });

// ── Auto Update Helper ───────────────────────────────────────────────────────
autoUpdater.autoDownload = true;

let mainWindow;
let isManualCheck = false;

autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', {
      current: app.getVersion(),
      latest: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
    });
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available.');
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', {
      upToDate: true,
      current: app.getVersion()
    });
  }
  isManualCheck = false;
});

autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
  if (isManualCheck && mainWindow) {
    mainWindow.webContents.send('update-error', err.message || err.toString());
  }
  isManualCheck = false;
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', {
      current: app.getVersion(),
      latest: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
    });
  }
  isManualCheck = false;

  // Show a dialog/notification to the user with a Restart Now button
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: 'A new update is available. Restart to apply.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  }).catch((err) => {
    console.error('Error showing update message box:', err);
  });
});

function checkForUpdates(fromUser = false) {
  isManualCheck = fromUser;
  
  if (isDev) {
    if (fromUser && mainWindow) {
      mainWindow.webContents.send('update-error', 'Update checks are disabled in development mode.');
    }
    return;
  }

  try {
    const pkg = require('../package.json');
    const githubPublish = pkg.build?.publish?.find(p => p.provider === 'github');
    if (githubPublish && githubPublish.owner === 'YOUR_GITHUB_USERNAME') {
      if (fromUser && mainWindow) {
        mainWindow.webContents.send('update-error', 'Update repository owner is not configured. Please update "YOUR_GITHUB_USERNAME" in package.json.');
      }
      return;
    }
  } catch (e) {
    console.error('Failed to read package.json configuration:', e);
  }

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('Error checking for updates:', err);
    if (fromUser && mainWindow) {
      mainWindow.webContents.send('update-error', err.message || err.toString());
    }
  });
}


// ── IPC handlers ────────────────────────────────────────────────────────────
ipcMain.on('check-for-updates', () => checkForUpdates(true));
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});
ipcMain.handle('get-app-version', () => app.getVersion());

// ── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });

  // Check on startup (after a short delay so the window is ready)
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => checkForUpdates(false), 3000);
  });
}

// Poll every 30 minutes
setInterval(() => checkForUpdates(false), 30 * 60 * 1000);

app.on('ready', createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });

