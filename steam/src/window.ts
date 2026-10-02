import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, type Input } from 'electron';

interface WindowPrefs {
  fullscreen: boolean;
}

const prefsFile = () => path.join(app.getPath('userData'), 'window.json');

function loadPrefs(): WindowPrefs {
  try {
    const data = JSON.parse(readFileSync(prefsFile(), 'utf8')) as Partial<WindowPrefs>;
    return { fullscreen: data.fullscreen !== false };
  } catch {
    return { fullscreen: true };
  }
}

function savePrefs(prefs: WindowPrefs): void {
  try {
    writeFileSync(prefsFile(), JSON.stringify(prefs));
  } catch {
    // Not fatal: the next launch just starts fullscreen.
  }
}

const isFullscreenToggle = (input: Input) =>
  input.type === 'keyDown' && (input.key === 'F11' || (input.key === 'Enter' && input.alt));

export interface GameWindowOptions {
  preload: string;
  /** Steam Deck: always fullscreen, the toggle does nothing. */
  forceFullscreen: boolean;
  devTools: boolean;
}

export function createGameWindow({ preload, forceFullscreen, devTools }: GameWindowOptions): BrowserWindow {
  const prefs = loadPrefs();
  const win = new BrowserWindow({
    title: 'Popscotch',
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 400,
    fullscreen: forceFullscreen || prefs.fullscreen,
    show: false,
    backgroundColor: '#d3ebc6',
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools,
      enableWebSQL: false,
      v8CacheOptions: 'bypassHeatCheck',
    },
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.on('before-input-event', (event, input) => {
    if (isFullscreenToggle(input)) {
      event.preventDefault();
      if (forceFullscreen) return;
      const fullscreen = !win.isFullScreen();
      win.setFullScreen(fullscreen);
      savePrefs({ fullscreen });
    } else if (devTools && input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
    }
  });

  // The page never navigates or opens windows; anything that tries is refused.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  return win;
}
