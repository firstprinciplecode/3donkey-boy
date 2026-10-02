import * as steamworks from 'steamworks.js';

type Client = ReturnType<typeof steamworks.init>;

const CLOUD_FILE = 'popscotch-save.json';

/**
 * Steamworks behind a null-safe front: without the Steam client (dev, or launched outside Steam)
 * every call is a no-op and the game plays as normal.
 */
export class Steam {
  private constructor(private readonly client: Client | null) {}

  static start(appId: number): Steam {
    try {
      return new Steam(steamworks.init(appId));
    } catch (err) {
      console.warn('[steam] Steamworks unavailable, running without Steam:', err instanceof Error ? err.message : err);
      return new Steam(null);
    }
  }

  /** Relaunches through Steam when started from the exe directly. True means quit now. */
  static relaunchThroughSteam(appId: number): boolean {
    try {
      return steamworks.restartAppIfNecessary(appId);
    } catch {
      return false;
    }
  }

  /** Injects the Steam overlay into Electron's compositor; call before the app is ready. */
  static enableOverlay(): void {
    // The game repaints every frame itself, so skip the library's repaint timer.
    steamworks.electronEnableSteamOverlay(true);
  }

  get available(): boolean {
    return this.client !== null;
  }

  get steamDeck(): boolean {
    return this.client?.utils.isSteamRunningOnSteamDeck() ?? false;
  }

  get language(): string | null {
    return this.client?.apps.currentGameLanguage() ?? null;
  }

  unlockAchievement(id: string): void {
    if (!this.client || this.client.achievement.isActivated(id)) return;
    if (this.client.achievement.activate(id)) this.client.stats.store();
  }

  setStatMax(name: string, value: number): void {
    if (!this.client) return;
    const current = this.client.stats.getInt(name);
    if (current !== null && value <= current) return;
    if (this.client.stats.setInt(name, value)) this.client.stats.store();
  }

  addStat(name: string, amount: number): void {
    if (!this.client) return;
    const current = this.client.stats.getInt(name) ?? 0;
    if (this.client.stats.setInt(name, current + amount)) this.client.stats.store();
  }

  setPresence(key: string, value: string | null): void {
    this.client?.localplayer.setRichPresence(key, value);
  }

  private get cloudReady(): boolean {
    return !!this.client && this.client.cloud.isEnabledForAccount() && this.client.cloud.isEnabledForApp();
  }

  readCloudSave(): string | null {
    if (!this.client || !this.cloudReady) return null;
    try {
      return this.client.cloud.fileExists(CLOUD_FILE) ? this.client.cloud.readFile(CLOUD_FILE) : null;
    } catch {
      return null;
    }
  }

  writeCloudSave(json: string): void {
    if (!this.client || !this.cloudReady) return;
    try {
      this.client.cloud.writeFile(CLOUD_FILE, json);
    } catch (err) {
      console.warn('[steam] cloud save failed:', err instanceof Error ? err.message : err);
    }
  }
}
