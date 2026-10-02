import { contextBridge, ipcRenderer } from 'electron';
import type { IPC as Channels, SteamBridge } from './bridge';

// Sandboxed preloads can only require 'electron', so the channel names are repeated here;
// the type keeps them identical to bridge.ts.
const IPC: typeof Channels = {
  info: 'popscotch:info',
  achievement: 'popscotch:achievement',
  statMax: 'popscotch:stat-max',
  statAdd: 'popscotch:stat-add',
  presence: 'popscotch:presence',
  cloudRead: 'popscotch:cloud-read',
  cloudWrite: 'popscotch:cloud-write',
  interrupt: 'popscotch:interrupt',
  quit: 'popscotch:quit',
};

const bridge: SteamBridge = {
  info: () => ipcRenderer.invoke(IPC.info),
  unlockAchievement: (id) => ipcRenderer.send(IPC.achievement, id),
  setStatMax: (name, value) => ipcRenderer.send(IPC.statMax, name, value),
  addStat: (name, amount) => ipcRenderer.send(IPC.statAdd, name, amount),
  setPresence: (key, value) => ipcRenderer.send(IPC.presence, key, value),
  readCloudSave: () => ipcRenderer.invoke(IPC.cloudRead),
  writeCloudSave: (json) => ipcRenderer.send(IPC.cloudWrite, json),
  onInterrupt: (listener) => {
    ipcRenderer.on(IPC.interrupt, () => listener());
  },
  quit: () => ipcRenderer.send(IPC.quit),
};

contextBridge.exposeInMainWorld('popscotch', bridge);
