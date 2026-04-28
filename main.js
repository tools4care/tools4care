// main.js — Electron entry point for Tools4Care desktop app
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Tools4Care',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Allow Supabase & external API calls
      webSecurity: true,
    },
    // App icon (add icon.png to project root for a custom icon)
    // icon: path.join(__dirname, 'public', 'icon.png'),
  });

  if (isDev) {
    // Dev: load Vite dev server
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    // Production: load built files
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Open external links in the system browser, not Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Hide menu bar on Windows/Linux (Mac has native menu)
  if (process.platform !== 'darwin') {
    win.setMenuBarVisibility(false);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
