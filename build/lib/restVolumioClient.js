"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var restVolumioClient_exports = {};
__export(restVolumioClient_exports, {
  RestVolumioClient: () => RestVolumioClient
});
module.exports = __toCommonJS(restVolumioClient_exports);
var import_axios = __toESM(require("axios"));
class RestVolumioClient {
  config;
  axiosInstance;
  connected = false;
  pollTimer;
  lastState;
  stateChangeCallbacks = [];
  connectionChangeCallbacks = [];
  constructor(config) {
    this.config = {
      ...config,
      pollInterval: config.pollInterval || 2e3
    };
    this.axiosInstance = import_axios.default.create({
      baseURL: `http://${config.host}:${config.port}`,
      timeout: 5e3
    });
  }
  async connect() {
    try {
      await this.getState();
      this.connected = true;
      this.notifyConnectionChange(true);
      this.startPolling();
    } catch (error) {
      this.connected = false;
      this.notifyConnectionChange(false);
      throw new Error(`Failed to connect to Volumio: ${error}`);
    }
  }
  async disconnect() {
    this.stopPolling();
    this.connected = false;
    this.notifyConnectionChange(false);
  }
  isConnected() {
    return this.connected;
  }
  async ping() {
    try {
      await this.axiosInstance.get("/api/v1/getState");
      return true;
    } catch {
      return false;
    }
  }
  onStateChange(callback) {
    this.stateChangeCallbacks.push(callback);
  }
  onConnectionChange(callback) {
    this.connectionChangeCallbacks.push(callback);
  }
  async getState() {
    const response = await this.axiosInstance.get("/api/v1/getState");
    return response.data;
  }
  async getSystemInfo() {
    const response = await this.axiosInstance.get(
      "/api/v1/getSystemInfo"
    );
    return response.data;
  }
  // ==================== Playback Control ====================
  async play(n) {
    const cmd = n !== void 0 ? `play&N=${n}` : "play";
    await this.sendCommand(cmd);
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
    await this.sendCommand(`seek&position=${position}`);
  }
  // ==================== Volume Control ====================
  async setVolume(volume) {
    if (volume < 0 || volume > 100) {
      throw new Error("Volume must be between 0 and 100");
    }
    await this.sendCommand(`volume&volume=${volume}`);
  }
  async volumePlus() {
    await this.sendCommand("volume&volume=plus");
  }
  async volumeMinus() {
    await this.sendCommand("volume&volume=minus");
  }
  async mute() {
    await this.sendCommand("volume&volume=mute");
  }
  async unmute() {
    await this.sendCommand("volume&volume=unmute");
  }
  async toggleMute() {
    await this.sendCommand("volume&volume=toggle");
  }
  // ==================== Queue Management ====================
  async clearQueue() {
    await this.sendCommand("clearQueue");
  }
  // ==================== Playback Options ====================
  async setRandom(enabled) {
    await this.sendCommand(`random&value=${enabled ? "true" : "false"}`);
  }
  async setRepeat(enabled) {
    await this.sendCommand(`repeat&value=${enabled ? "true" : "false"}`);
  }
  async setRepeatSingle(enabled) {
    await this.sendCommand(`repeatSingle&value=${enabled ? "true" : "false"}`);
  }
  // ==================== Private Methods ====================
  async sendCommand(cmd) {
    await this.axiosInstance.get(`/api/v1/commands/?cmd=${cmd}`);
  }
  startPolling() {
    if (this.pollTimer) {
      return;
    }
    this.pollTimer = setInterval(async () => {
      try {
        const state = await this.getState();
        this.checkStateChange(state);
      } catch (_error) {
        if (this.connected) {
          this.connected = false;
          this.notifyConnectionChange(false);
        }
      }
    }, this.config.pollInterval);
  }
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = void 0;
    }
  }
  checkStateChange(newState) {
    if (!this.lastState || this.hasStateChanged(this.lastState, newState)) {
      this.lastState = newState;
      this.notifyStateChange(newState);
    }
  }
  hasStateChanged(oldState, newState) {
    return oldState.status !== newState.status || oldState.position !== newState.position || oldState.title !== newState.title || oldState.volume !== newState.volume || oldState.mute !== newState.mute || oldState.random !== newState.random || oldState.repeat !== newState.repeat;
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
  RestVolumioClient
});
//# sourceMappingURL=restVolumioClient.js.map
