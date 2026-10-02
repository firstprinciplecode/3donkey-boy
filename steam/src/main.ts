import path from 'node:path';
import { app, session } from 'electron';
import { IPC } from './bridge';
import { APP_ORIGIN, DEV_URL, STEAM_APP_ID } from './config';
import { handleBridge } from './ipc';
import { registerAppScheme, serveGame } from './protocol';
import { Steam } from './steam';
import { createGameWindow } from './window';

/** Steam sets SteamAppId when it launches the game; otherwise use the configured id. */
const appId = Number(process.env.SteamAppId) || STEAM_APP_ID;

if (!app.requestSingleInstanceLock()) app.exit(0);

// A shipped build started from its exe hands over to Steam, which relaunches it with the overlay.
if (app.isPackaged && appId !== 480 && Steam.relaunchThroughSteam(appId)) app.exit(0);

const steam = Steam.start(appId);
if (steam.available) Steam.enableOverlay();

// Gamepad presses don't count as a user gesture, so without this a pad-only player
// (every Steam Deck) would start the game with the audio context still suspended.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (process.platform === 'linux') {
  // Chromium blocklists some Mesa drivers (including older Steam Deck images) and would fall back
  // to software WebGL, which can't hold 60 fps here. (--no-sandbox comes from the launcher script
  // written by scripts/after-pack.cjs; it can't be set this late.)
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}

registerAppScheme();
handleBridge(steam);

app.on('window-all-closed', () => app.quit());

void app.whenReady().then(async () => {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  serveGame(ses, path.join(__dirname, 'web'));

  const win = createGameWindow({
    preload: path.join(__dirname, 'preload.js'),
    forceFullscreen: steam.steamDeck,
    devTools: !app.isPackaged,
  });

  win.on('blur', () => win.webContents.send(IPC.interrupt));
  app.on('second-instance', () => {
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  await win.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`);
});
