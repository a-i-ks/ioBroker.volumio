/**
 * WebSocket implementation of Volumio Client
 *
 * This client communicates with Volumio using Socket.IO WebSocket connections.
 * Real-time state updates are received via 'pushState' events.
 */

import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import type {
  IVolumioClient,
  VolumioState,
  VolumioSystemInfo,
  StateChangeCallback,
  ConnectionStateCallback,
} from "./volumioClient";

export interface WebSocketClientConfig {
  host: string;
  port: number;
  reconnectAttempts?: number; // Number of reconnection attempts (default: 5)
  reconnectDelay?: number; // Delay between reconnection attempts in ms (default: 2000)
}

export class WebSocketVolumioClient implements IVolumioClient {
  private config: WebSocketClientConfig;
  private socket?: Socket;
  private connected: boolean = false;
  private stateChangeCallbacks: StateChangeCallback[] = [];
  private connectionChangeCallbacks: ConnectionStateCallback[] = [];

  constructor(config: WebSocketClientConfig) {
    this.config = {
      ...config,
      reconnectAttempts: config.reconnectAttempts || 5,
      reconnectDelay: config.reconnectDelay || 2000,
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `http://${this.config.host}:${this.config.port}`;

      this.socket = io(url, {
        reconnection: true,
        reconnectionAttempts: this.config.reconnectAttempts,
        reconnectionDelay: this.config.reconnectDelay,
        timeout: 10000,
      });

      this.socket.on("connect", () => {
        this.connected = true;
        this.notifyConnectionChange(true);
        resolve();
      });

      this.socket.on("disconnect", () => {
        this.connected = false;
        this.notifyConnectionChange(false);
      });

      this.socket.on("connect_error", (error) => {
        if (!this.connected) {
          reject(new Error(`Failed to connect to Volumio: ${error.message}`));
        }
      });

      // Listen for state updates
      this.socket.on("pushState", (state: VolumioState) => {
        this.notifyStateChange(state);
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
    }
    this.connected = false;
    this.notifyConnectionChange(false);
  }

  isConnected(): boolean {
    return this.connected && this.socket?.connected === true;
  }

  async ping(): Promise<boolean> {
    return this.isConnected();
  }

  onStateChange(callback: StateChangeCallback): void {
    this.stateChangeCallbacks.push(callback);
  }

  onConnectionChange(callback: ConnectionStateCallback): void {
    this.connectionChangeCallbacks.push(callback);
  }

  async getState(): Promise<VolumioState> {
    return this.sendCommand<VolumioState>("getState");
  }

  async getSystemInfo(): Promise<VolumioSystemInfo> {
    return this.sendCommand<VolumioSystemInfo>("getSystemInfo");
  }

  // ==================== Playback Control ====================

  async play(n?: number): Promise<void> {
    if (n !== undefined) {
      await this.sendCommand("play", { value: n });
    } else {
      await this.sendCommand("play");
    }
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
    await this.sendCommand("seek", { position });
  }

  // ==================== Volume Control ====================

  async setVolume(volume: number): Promise<void> {
    if (volume < 0 || volume > 100) {
      throw new Error("Volume must be between 0 and 100");
    }
    await this.sendCommand("volume", { value: volume });
  }

  async volumePlus(): Promise<void> {
    await this.sendCommand("volume", { value: "plus" });
  }

  async volumeMinus(): Promise<void> {
    await this.sendCommand("volume", { value: "minus" });
  }

  async mute(): Promise<void> {
    await this.sendCommand("mute");
  }

  async unmute(): Promise<void> {
    await this.sendCommand("unmute");
  }

  async toggleMute(): Promise<void> {
    await this.sendCommand("mute", { value: "toggle" });
  }

  // ==================== Queue Management ====================

  async clearQueue(): Promise<void> {
    await this.sendCommand("clearQueue");
  }

  // ==================== Playback Options ====================

  async setRandom(enabled: boolean): Promise<void> {
    await this.sendCommand("random", { value: enabled });
  }

  async setRepeat(enabled: boolean): Promise<void> {
    await this.sendCommand("repeat", { value: enabled });
  }

  async setRepeatSingle(enabled: boolean): Promise<void> {
    await this.sendCommand("repeatSingle", { value: enabled });
  }

  // ==================== Private Methods ====================

  private async sendCommand<T = void>(
    command: string,
    data?: Record<string, unknown>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Not connected to Volumio"));
        return;
      }

      // For commands that return data (like getState)
      if (command === "getState" || command === "getSystemInfo") {
        this.socket.emit(command);
        this.socket.once(command, (response: T) => {
          resolve(response);
        });
      } else {
        // For commands that don't return data
        if (data) {
          this.socket.emit(command, data);
        } else {
          this.socket.emit(command);
        }
        resolve(undefined as T);
      }
    });
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
