import { app, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { IPC, type SteamInfo } from './bridge';
import { APP_ORIGIN, DEV_URL, STATS } from './config';
import type { Steam } from './steam';

const ACHIEVEMENT_ID = /^[A-Z0-9_]{1,64}$/;
const PRESENCE_KEY = /^[a-z_]{1,32}$/;
const PRESENCE_VALUE_MAX = 256;
const CLOUD_SAVE_MAX = 64 * 1024;
const STAT_MAX = 1_000_000_000;

const isStat = (name: unknown): name is (typeof STATS)[number] => STATS.includes(name as (typeof STATS)[number]);
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= STAT_MAX;

/** Only the game page may talk to Steam, never a frame from anywhere else. */
function fromGame(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  return url.startsWith(`${APP_ORIGIN}/`) || (DEV_URL !== null && url.startsWith(DEV_URL));
}

export function handleBridge(steam: Steam): void {
  ipcMain.handle(IPC.info, (event): SteamInfo | null => {
    if (!fromGame(event)) return null;
    return { steam: steam.available, steamDeck: steam.steamDeck, language: steam.language };
  });

  ipcMain.handle(IPC.cloudRead, (event) => (fromGame(event) ? steam.readCloudSave() : null));

  ipcMain.on(IPC.cloudWrite, (event, json: unknown) => {
    if (fromGame(event) && typeof json === 'string' && json.length <= CLOUD_SAVE_MAX) steam.writeCloudSave(json);
  });

  ipcMain.on(IPC.achievement, (event, id: unknown) => {
    if (fromGame(event) && typeof id === 'string' && ACHIEVEMENT_ID.test(id)) steam.unlockAchievement(id);
  });

  ipcMain.on(IPC.statMax, (event, name: unknown, value: unknown) => {
    if (fromGame(event) && isStat(name) && isCount(value)) steam.setStatMax(name, value);
  });

  ipcMain.on(IPC.statAdd, (event, name: unknown, amount: unknown) => {
    if (fromGame(event) && isStat(name) && isCount(amount)) steam.addStat(name, amount);
  });

  ipcMain.on(IPC.presence, (event, key: unknown, value: unknown) => {
    if (!fromGame(event) || typeof key !== 'string' || !PRESENCE_KEY.test(key)) return;
    if (value === null || (typeof value === 'string' && value.length <= PRESENCE_VALUE_MAX)) steam.setPresence(key, value);
  });

  ipcMain.on(IPC.quit, (event) => {
    if (fromGame(event)) app.quit();
  });
}
