/**
 * REST API implementation of Volumio Client
 *
 * This client communicates with Volumio using the REST API.
 * Polling is used to detect state changes.
 */

import type { AxiosInstance } from "axios";
import axios from "axios";
import type {
  IVolumioClient,
  VolumioState,
  VolumioSystemInfo,
  StateChangeCallback,
  ConnectionStateCallback,
} from "./volumioClient";

export interface RestClientConfig {
  host: string;
  port: number;
  pollInterval?: number; // Polling interval in ms (default: 2000)
}

export class RestVolumioClient implements IVolumioClient {
  private config: RestClientConfig;
  private axiosInstance: AxiosInstance;
  private connected: boolean = false;
  private pollTimer?: NodeJS.Timeout;
  private lastState?: VolumioState;
  private stateChangeCallbacks: StateChangeCallback[] = [];
  private connectionChangeCallbacks: ConnectionStateCallback[] = [];

  constructor(config: RestClientConfig) {
    this.config = {
      ...config,
      pollInterval: config.pollInterval || 2000,
    };

    this.axiosInstance = axios.create({
      baseURL: `http://${config.host}:${config.port}`,
      timeout: 5000,
    });
  }

  async connect(): Promise<void> {
    try {
      // Test connection by getting state
      await this.getState();
      this.connected = true;
      this.notifyConnectionChange(true);

      // Start polling for state changes
      this.startPolling();
    } catch (error) {
      this.connected = false;
      this.notifyConnectionChange(false);
      throw new Error(`Failed to connect to Volumio: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    this.connected = false;
    this.notifyConnectionChange(false);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async ping(): Promise<boolean> {
    try {
      await this.axiosInstance.get("/api/v1/getState");
      return true;
    } catch {
      return false;
    }
  }

  onStateChange(callback: StateChangeCallback): void {
    this.stateChangeCallbacks.push(callback);
  }

  onConnectionChange(callback: ConnectionStateCallback): void {
    this.connectionChangeCallbacks.push(callback);
  }

  async getState(): Promise<VolumioState> {
    const response =
      await this.axiosInstance.get<VolumioState>("/api/v1/getState");
    return response.data;
  }

  async getSystemInfo(): Promise<VolumioSystemInfo> {
    const response = await this.axiosInstance.get<VolumioSystemInfo>(
      "/api/v1/getSystemInfo",
    );
    return response.data;
  }

  // ==================== Playback Control ====================

  async play(n?: number): Promise<void> {
    const cmd = n !== undefined ? `play&N=${n}` : "play";
    await this.sendCommand(cmd);
  }

  async pause(): Promise<void> {
    await this.sendCommand("pause");
  }

  async stop(): Promise<void> {
    await this.sendCommand("stop");
  }

  async toggle(): Promise<void> {
    await this.sendCommand("toggle");
  }

  async next(): Promise<void> {
    await this.sendCommand("next");
  }

  async previous(): Promise<void> {
    await this.sendCommand("prev");
  }

  async seek(position: number): Promise<void> {
    await this.sendCommand(`seek&position=${position}`);
  }

  // ==================== Volume Control ====================

  async setVolume(volume: number): Promise<void> {
    if (volume < 0 || volume > 100) {
      throw new Error("Volume must be between 0 and 100");
    }
    await this.sendCommand(`volume&volume=${volume}`);
  }

  async volumePlus(): Promise<void> {
    await this.sendCommand("volume&volume=plus");
  }

  async volumeMinus(): Promise<void> {
    await this.sendCommand("volume&volume=minus");
  }

  async mute(): Promise<void> {
    await this.sendCommand("volume&volume=mute");
  }

  async unmute(): Promise<void> {
    await this.sendCommand("volume&volume=unmute");
  }

  async toggleMute(): Promise<void> {
    await this.sendCommand("volume&volume=toggle");
  }

  // ==================== Queue Management ====================

  async clearQueue(): Promise<void> {
    await this.sendCommand("clearQueue");
  }

  // ==================== Playback Options ====================

  async setRandom(enabled: boolean): Promise<void> {
    await this.sendCommand(`random&value=${enabled ? "true" : "false"}`);
  }

  async setRepeat(enabled: boolean): Promise<void> {
    await this.sendCommand(`repeat&value=${enabled ? "true" : "false"}`);
  }

  async setRepeatSingle(enabled: boolean): Promise<void> {
    await this.sendCommand(`repeatSingle&value=${enabled ? "true" : "false"}`);
  }

  // ==================== Private Methods ====================

  private async sendCommand(cmd: string): Promise<void> {
    await this.axiosInstance.get(`/api/v1/commands/?cmd=${cmd}`);
  }

  private startPolling(): void {
    if (this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(async () => {
      try {
        const state = await this.getState();
        this.checkStateChange(state);
      } catch (_error) {
        // Connection lost
        if (this.connected) {
          this.connected = false;
          this.notifyConnectionChange(false);
        }
      }
    }, this.config.pollInterval);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private checkStateChange(newState: VolumioState): void {
    // Compare relevant state fields to detect changes
    if (!this.lastState || this.hasStateChanged(this.lastState, newState)) {
      this.lastState = newState;
      this.notifyStateChange(newState);
    }
  }

  private hasStateChanged(
    oldState: VolumioState,
    newState: VolumioState,
  ): boolean {
    // Check key fields that indicate a meaningful state change
    return (
      oldState.status !== newState.status ||
      oldState.position !== newState.position ||
      oldState.title !== newState.title ||
      oldState.volume !== newState.volume ||
      oldState.mute !== newState.mute ||
      oldState.random !== newState.random ||
      oldState.repeat !== newState.repeat
    );
  }

  private notifyStateChange(state: VolumioState): void {
    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(state);
      } catch (_error) {
        // Ignore callback errors
      }
    }
  }

  private notifyConnectionChange(connected: boolean): void {
    for (const callback of this.connectionChangeCallbacks) {
      try {
        callback(connected);
      } catch (_error) {
        // Ignore callback errors
      }
    }
  }
}
