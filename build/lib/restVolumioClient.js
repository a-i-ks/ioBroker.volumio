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
var import_logger = require("./logger");
class RestVolumioClient {
  config;
  axiosInstance;
  connected = false;
  logger;
  pollTimer;
  lastState;
  stateChangeCallbacks = [];
  connectionChangeCallbacks = [];
  constructor(config) {
    var _a, _b;
    this.config = {
      ...config,
      pollInterval: (_a = config.pollInterval) != null ? _a : 2e3,
      logger: (_b = config.logger) != null ? _b : new import_logger.NoOpLogger()
    };
    this.logger = this.config.logger;
    this.logger.debug(
      `REST client initialized: ${this.config.host}:${this.config.port} (poll: ${this.config.pollInterval}ms)`
    );
    this.axiosInstance = import_axios.default.create({
      baseURL: `http://${config.host}:${config.port}`,
      timeout: 5e3
    });
  }
  async connect() {
    var _a, _b;
    this.logger.info(
      `Connecting to Volumio via REST API: http://${this.config.host}:${this.config.port}`
    );
    try {
      this.logger.debug("Testing connection with getState() call...");
      const state = await this.getState();
      this.logger.silly(`Initial state: ${JSON.stringify(state)}`);
      this.connected = true;
      this.notifyConnectionChange(true);
      this.logger.info("REST API connection successful");
      this.logger.debug(
        `Starting state polling (interval: ${this.config.pollInterval}ms)`
      );
      this.startPolling();
    } catch (error) {
      this.connected = false;
      this.notifyConnectionChange(false);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails = import_axios.default.isAxiosError(error) ? {
        status: (_a = error.response) == null ? void 0 : _a.status,
        statusText: (_b = error.response) == null ? void 0 : _b.statusText,
        code: error.code
      } : {};
      this.logger.error(
        `Failed to connect to Volumio at ${this.config.host}:${this.config.port}: ${errorMessage} ${JSON.stringify(errorDetails)}`
      );
      throw new Error(
        `Failed to connect to Volumio at ${this.config.host}:${this.config.port} - ${errorMessage}`
      );
    }
  }
  async disconnect() {
    this.logger.info("Disconnecting REST client...");
    this.stopPolling();
    this.connected = false;
    this.notifyConnectionChange(false);
    this.logger.debug("REST client disconnected");
  }
  isConnected() {
    return this.connected;
  }
  async ping() {
    this.logger.debug("Pinging Volumio...");
    try {
      await this.axiosInstance.get("/api/v1/getState");
      this.logger.debug("Ping successful");
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Ping failed: ${errorMessage}`);
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
    this.logger.debug("Fetching player state...");
    try {
      const response = await this.axiosInstance.get("/api/v1/getState");
      this.logger.silly(`State response: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`getState() failed: ${errorMessage}`);
      throw error;
    }
  }
  async getSystemInfo() {
    this.logger.debug("Fetching system info...");
    try {
      const response = await this.axiosInstance.get(
        "/api/v1/getSystemInfo"
      );
      this.logger.silly(
        `System info response: ${JSON.stringify(response.data)}`
      );
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`getSystemInfo() failed: ${errorMessage}`);
      throw error;
    }
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
    this.logger.debug(`Sending command: ${cmd}`);
    try {
      await this.axiosInstance.get(`/api/v1/commands/?cmd=${cmd}`);
      this.logger.debug(`Command ${cmd} sent successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Command ${cmd} failed: ${errorMessage}`);
      throw error;
    }
  }
  startPolling() {
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Polling error: ${errorMessage}`);
        if (this.connected) {
          this.logger.error("Connection lost during polling");
          this.connected = false;
          this.notifyConnectionChange(false);
        }
      }
    }, this.config.pollInterval);
  }
  stopPolling() {
    if (this.pollTimer) {
      this.logger.debug("Stopping polling timer");
      clearInterval(this.pollTimer);
      this.pollTimer = void 0;
    }
  }
  checkStateChange(newState) {
    if (!this.lastState || this.hasStateChanged(this.lastState, newState)) {
      this.logger.debug("State change detected");
      this.logger.silly(
        `Old state: ${JSON.stringify(this.lastState)}, New state: ${JSON.stringify(newState)}`
      );
      this.lastState = newState;
      this.notifyStateChange(newState);
    }
  }
  hasStateChanged(oldState, newState) {
    return oldState.status !== newState.status || oldState.position !== newState.position || oldState.title !== newState.title || oldState.volume !== newState.volume || oldState.mute !== newState.mute || oldState.random !== newState.random || oldState.repeat !== newState.repeat;
  }
  notifyStateChange(state) {
    this.logger.debug("Notifying state change callbacks");
    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(state);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`State change callback error: ${errorMessage}`);
      }
    }
  }
  notifyConnectionChange(connected) {
    this.logger.debug(`Notifying connection change: ${connected}`);
    for (const callback of this.connectionChangeCallbacks) {
      try {
        callback(connected);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Connection change callback error: ${errorMessage}`);
      }
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RestVolumioClient
});
//# sourceMappingURL=restVolumioClient.js.map
