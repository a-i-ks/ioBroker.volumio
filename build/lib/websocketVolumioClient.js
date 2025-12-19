"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var websocketVolumioClient_exports = {};
__export(websocketVolumioClient_exports, {
  WebSocketVolumioClient: () => WebSocketVolumioClient
});
module.exports = __toCommonJS(websocketVolumioClient_exports);
var import_socket = require("socket.io-client");
class WebSocketVolumioClient {
  config;
  socket;
  connected = false;
  stateChangeCallbacks = [];
  connectionChangeCallbacks = [];
  constructor(config) {
    this.config = {
      ...config,
      reconnectAttempts: config.reconnectAttempts || 5,
      reconnectDelay: config.reconnectDelay || 2e3
    };
  }
  async connect() {
    return new Promise((resolve, reject) => {
      const url = `http://${this.config.host}:${this.config.port}`;
      this.socket = (0, import_socket.io)(url, {
        reconnection: true,
        reconnectionAttempts: this.config.reconnectAttempts,
        reconnectionDelay: this.config.reconnectDelay,
        timeout: 1e4
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
      this.socket.on("pushState", (state) => {
        this.notifyStateChange(state);
      });
    });
  }
  async disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = void 0;
    }
    this.connected = false;
    this.notifyConnectionChange(false);
  }
  isConnected() {
    var _a;
    return this.connected && ((_a = this.socket) == null ? void 0 : _a.connected) === true;
  }
  async ping() {
    return this.isConnected();
  }
  onStateChange(callback) {
    this.stateChangeCallbacks.push(callback);
  }
  onConnectionChange(callback) {
    this.connectionChangeCallbacks.push(callback);
  }
  async getState() {
    return this.sendCommand("getState");
  }
  async getSystemInfo() {
    return this.sendCommand("getSystemInfo");
  }
  // ==================== Playback Control ====================
  async play(n) {
    if (n !== void 0) {
      await this.sendCommand("play", { value: n });
    } else {
      await this.sendCommand("play");
    }
  }
  async pause() {
    await this.sendCommand("pause");
  }
  async stop() {
    await this.sendCommand("stop");
  }
  async toggle() {
    await this.sendCommand("toggle");
  }
  async next() {
    await this.sendCommand("next");
  }
  async previous() {
    await this.sendCommand("prev");
  }
  async seek(position) {
    await this.sendCommand("seek", { position });
  }
  // ==================== Volume Control ====================
  async setVolume(volume) {
    if (volume < 0 || volume > 100) {
      throw new Error("Volume must be between 0 and 100");
    }
    await this.sendCommand("volume", { value: volume });
  }
  async volumePlus() {
    await this.sendCommand("volume", { value: "plus" });
  }
  async volumeMinus() {
    await this.sendCommand("volume", { value: "minus" });
  }
  async mute() {
    await this.sendCommand("mute");
  }
  async unmute() {
    await this.sendCommand("unmute");
  }
  async toggleMute() {
    await this.sendCommand("mute", { value: "toggle" });
  }
  // ==================== Queue Management ====================
  async clearQueue() {
    await this.sendCommand("clearQueue");
  }
  // ==================== Playback Options ====================
  async setRandom(enabled) {
    await this.sendCommand("random", { value: enabled });
  }
  async setRepeat(enabled) {
    await this.sendCommand("repeat", { value: enabled });
  }
  async setRepeatSingle(enabled) {
    await this.sendCommand("repeatSingle", { value: enabled });
  }
  // ==================== Private Methods ====================
  async sendCommand(command, data) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Not connected to Volumio"));
        return;
      }
      if (command === "getState" || command === "getSystemInfo") {
        this.socket.emit(command);
        this.socket.once(command, (response) => {
          resolve(response);
        });
      } else {
        if (data) {
          this.socket.emit(command, data);
        } else {
          this.socket.emit(command);
        }
        resolve(void 0);
      }
    });
  }
  notifyStateChange(state) {
    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(state);
      } catch (_error) {
      }
    }
  }
  notifyConnectionChange(connected) {
    for (const callback of this.connectionChangeCallbacks) {
      try {
        callback(connected);
      } catch (_error) {
      }
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WebSocketVolumioClient
});
//# sourceMappingURL=websocketVolumioClient.js.map
