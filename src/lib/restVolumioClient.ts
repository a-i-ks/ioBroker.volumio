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
import type { Logger } from "./logger";
import { NoOpLogger } from "./logger";

export interface RestClientConfig {
  host: string;
  port: number;
  pollInterval?: number; // Polling interval in ms (default: 2000)
  logger?: Logger; // Logger instance (optional)
}

export class RestVolumioClient implements IVolumioClient {
  private config: Required<RestClientConfig>;
  private axiosInstance: AxiosInstance;
  private connected: boolean = false;
  private logger: Logger;
  private pollTimer?: NodeJS.Timeout;
  private lastState?: VolumioState;
  private stateChangeCallbacks: StateChangeCallback[] = [];
  private connectionChangeCallbacks: ConnectionStateCallback[] = [];

  constructor(config: RestClientConfig) {
    this.config = {
      ...config,
      pollInterval: config.pollInterval ?? 2000,
      logger: config.logger ?? new NoOpLogger(),
    };

    this.logger = this.config.logger;
    this.logger.debug(
      `REST client initialized: ${this.config.host}:${this.config.port} (poll: ${this.config.pollInterval}ms)`,
    );

    this.axiosInstance = axios.create({
      baseURL: `http://${config.host}:${config.port}`,
      timeout: 5000,
    });
  }

  async connect(): Promise<void> {
    this.logger.info(
      `Connecting to Volumio via REST API: http://${this.config.host}:${this.config.port}`,
    );

    try {
      this.logger.debug("Testing connection with getState() call...");
      // Test connection by getting state
      const state = await this.getState();
      this.logger.silly(`Initial state: ${JSON.stringify(state)}`);

      this.connected = true;
      this.notifyConnectionChange(true);
      this.logger.info("REST API connection successful");

      // Start polling for state changes
      this.logger.debug(
        `Starting state polling (interval: ${this.config.pollInterval}ms)`,
      );
      this.startPolling();
    } catch (error) {
      this.connected = false;
      this.notifyConnectionChange(false);

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorDetails = axios.isAxiosError(error)
        ? {
            status: error.response?.status,
            statusText: error.response?.statusText,
            code: error.code,
          }
        : {};

      this.logger.error(
        `Failed to connect to Volumio at ${this.config.host}:${this.config.port}: ${errorMessage} ${JSON.stringify(errorDetails)}`,
      );

      throw new Error(
        `Failed to connect to Volumio at ${this.config.host}:${this.config.port} - ${errorMessage}`,
      );
    }
  }

  async disconnect(): Promise<void> {
    this.logger.info("Disconnecting REST client...");
    this.stopPolling();
    this.connected = false;
    this.notifyConnectionChange(false);
    this.logger.debug("REST client disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  async ping(): Promise<boolean> {
    this.logger.debug("Pinging Volumio...");
    try {
      await this.axiosInstance.get("/api/v1/getState");
      this.logger.debug("Ping successful");
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(`Ping failed: ${errorMessage}`);
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
    this.logger.debug("Fetching player state...");
    try {
      const response =
        await this.axiosInstance.get<VolumioState>("/api/v1/getState");
      this.logger.silly(`State response: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`getState() failed: ${errorMessage}`);
      throw error;
    }
  }

  async getSystemInfo(): Promise<VolumioSystemInfo> {
    this.logger.debug("Fetching system info...");
    try {
      const response = await this.axiosInstance.get<VolumioSystemInfo>(
        "/api/v1/getSystemInfo",
      );
      this.logger.silly(
        `System info response: ${JSON.stringify(response.data)}`,
      );
      return response.data;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`getSystemInfo() failed: ${errorMessage}`);
      throw error;
    }
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
    this.logger.debug(`Sending command: ${cmd}`);
    try {
      await this.axiosInstance.get(`/api/v1/commands/?cmd=${cmd}`);
      this.logger.debug(`Command ${cmd} sent successfully`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Command ${cmd} failed: ${errorMessage}`);
      throw error;
    }
  }

  private startPolling(): void {
    if (this.pollTimer) {
      this.logger.warn("Polling already active");
      return;
    }

    this.logger.debug("Starting polling timer");
    this.pollTimer = setInterval(async () => {
      try {
        this.logger.silly("Polling state...");
        const state = await this.getState();
        this.checkStateChange(state);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(`Polling error: ${errorMessage}`);

        // Connection lost
        if (this.connected) {
          this.logger.error("Connection lost during polling");
          this.connected = false;
          this.notifyConnectionChange(false);
        }
      }
    }, this.config.pollInterval);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      this.logger.debug("Stopping polling timer");
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private checkStateChange(newState: VolumioState): void {
    // Compare relevant state fields to detect changes
    if (!this.lastState || this.hasStateChanged(this.lastState, newState)) {
      this.logger.debug("State change detected");
      this.logger.silly(
        `Old state: ${JSON.stringify(this.lastState)}, New state: ${JSON.stringify(newState)}`,
      );
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
    this.logger.debug("Notifying state change callbacks");
    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(state);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`State change callback error: ${errorMessage}`);
      }
    }
  }

  private notifyConnectionChange(connected: boolean): void {
    this.logger.debug(`Notifying connection change: ${connected}`);
    for (const callback of this.connectionChangeCallbacks) {
      try {
        callback(connected);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`Connection change callback error: ${errorMessage}`);
      }
    }
  }
}
