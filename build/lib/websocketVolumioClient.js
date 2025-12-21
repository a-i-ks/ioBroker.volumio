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
var websocketVolumioClient_exports = {};
__export(websocketVolumioClient_exports, {
  WebSocketVolumioClient: () => WebSocketVolumioClient
});
module.exports = __toCommonJS(websocketVolumioClient_exports);
var import_socket = __toESM(require("socket.io-client"));
var import_logger = require("./logger");
class WebSocketVolumioClient {
  config;
  socket;
  connected = false;
  logger;
  stateChangeCallbacks = [];
  connectionChangeCallbacks = [];
  constructor(config) {
    var _a, _b, _c, _d, _e, _f, _g;
    this.config = {
      ...config,
      reconnectAttempts: (_a = config.reconnectAttempts) != null ? _a : 5,
      reconnectDelay: (_b = config.reconnectDelay) != null ? _b : 2e3,
      socketPath: (_c = config.socketPath) != null ? _c : "/socket.io",
      transports: (_d = config.transports) != null ? _d : ["websocket", "polling"],
      timeout: (_e = config.timeout) != null ? _e : 1e4,
      forceNew: (_f = config.forceNew) != null ? _f : false,
      validateConnection: config.validateConnection !== false,
      // Default: true
      logger: (_g = config.logger) != null ? _g : new import_logger.NoOpLogger()
    };
    this.logger = this.config.logger;
    this.logger.debug(
      `WebSocket client initialized: ${this.config.host}:${this.config.port} (path: ${this.config.socketPath})`
    );
  }
  async connect() {
    return new Promise((resolve, reject) => {
      const url = `http://${this.config.host}:${this.config.port}`;
      this.logger.info(
        `Connecting to Volumio via WebSocket: ${url} (path: ${this.config.socketPath}, transports: ${this.config.transports.join(", ")})`
      );
      this.logger.debug(
        `Socket.IO config: reconnectAttempts=${this.config.reconnectAttempts}, reconnectDelay=${this.config.reconnectDelay}ms, timeout=${this.config.timeout}ms`
      );
      this.socket = (0, import_socket.default)(url, {
        path: this.config.socketPath,
        transports: this.config.transports,
        reconnection: true,
        reconnectionAttempts: this.config.reconnectAttempts,
        reconnectionDelay: this.config.reconnectDelay,
        timeout: this.config.timeout,
        forceNew: this.config.forceNew
      });
      let initialConnectionResolved = false;
      this.socket.on("connect", async () => {
        var _a, _b, _c, _d, _e;
        const transportName = (_d = (_c = (_b = (_a = this.socket) == null ? void 0 : _a.io) == null ? void 0 : _b.engine) == null ? void 0 : _c.transport) == null ? void 0 : _d.name;
        this.logger.info(`WebSocket connected successfully (transport: ${transportName})`);
        this.connected = true;
        this.notifyConnectionChange(true);
        if (this.config.validateConnection && !initialConnectionResolved) {
          this.logger.debug("Validating connection with getState() call...");
          try {
            await this.getState();
            this.logger.debug("Connection validation successful");
            initialConnectionResolved = true;
            resolve();
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Connection validation failed: ${errorMessage}`);
            initialConnectionResolved = true;
            (_e = this.socket) == null ? void 0 : _e.disconnect();
            reject(new Error(`WebSocket connected but validation failed: ${errorMessage}`));
          }
        } else if (!initialConnectionResolved) {
          initialConnectionResolved = true;
          resolve();
        }
      });
      this.socket.on("disconnect", (reason) => {
        this.logger.warn(`WebSocket disconnected: ${reason}`);
        this.connected = false;
        this.notifyConnectionChange(false);
      });
      this.socket.on("connect_error", (error) => {
        var _a, _b, _c, _d;
        const errorDetails = {
          message: error.message,
          type: error.name,
          description: error.description,
          context: error.context
        };
        this.logger.error(`WebSocket connection error: ${JSON.stringify(errorDetails)}`);
        this.logger.debug(
          `Connection attempt to ${url} failed. Transport: ${((_d = (_c = (_b = (_a = this.socket) == null ? void 0 : _a.io) == null ? void 0 : _b.engine) == null ? void 0 : _c.transport) == null ? void 0 : _d.name) || "unknown"}`
        );
        if (!initialConnectionResolved) {
          initialConnectionResolved = true;
          reject(
            new Error(
              `Failed to connect to Volumio at ${this.config.host}:${this.config.port} - ${error.message}`
            )
          );
        } else {
          this.logger.warn(`Reconnection attempt failed: ${error.message} (will retry)`);
        }
      });
      this.socket.io.on("reconnect_attempt", (attempt) => {
        this.logger.debug(`WebSocket reconnection attempt ${attempt}/${this.config.reconnectAttempts}`);
      });
      this.socket.io.on("reconnect_failed", () => {
        this.logger.error(
          `WebSocket reconnection failed after ${this.config.reconnectAttempts} attempts`
        );
      });
      this.socket.io.on("reconnect", (attempt) => {
        this.logger.info(`WebSocket reconnected successfully after ${attempt} attempt(s)`);
      });
      this.socket.on("pushState", (state) => {
        this.logger.silly(`Received pushState event: ${JSON.stringify(state)}`);
        this.notifyStateChange(state);
      });
      setTimeout(() => {
        var _a;
        if (!initialConnectionResolved) {
          this.logger.error(`Connection timeout after ${this.config.timeout}ms`);
          initialConnectionResolved = true;
          (_a = this.socket) == null ? void 0 : _a.disconnect();
          reject(
            new Error(
              `Connection timeout: No response from Volumio at ${this.config.host}:${this.config.port} after ${this.config.timeout}ms`
            )
          );
        }
      }, this.config.timeout + 1e3);
    });
  }
  async disconnect() {
    this.logger.info("Disconnecting WebSocket client...");
    if (this.socket) {
      this.socket.disconnect();
      this.socket = void 0;
      this.logger.debug("WebSocket disconnected");
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
    this.logger.debug("Fetching system info via REST API fallback...");
    try {
      const axios = await Promise.resolve().then(() => __toESM(require("axios")));
      const response = await axios.default.get(
        `http://${this.config.host}:${this.config.port}/api/v1/getSystemInfo`,
        { timeout: 5e3 }
      );
      this.logger.silly(`System info response: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`getSystemInfo() via REST fallback failed: ${errorMessage}`);
      throw error;
    }
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
    var _a, _b;
    if (volume < 0 || volume > 100) {
      throw new Error("Volume must be between 0 and 100");
    }
    this.logger.debug(`Setting volume to ${volume} via REST API fallback...`);
    try {
      const axios = await Promise.resolve().then(() => __toESM(require("axios")));
      const response = await axios.default.get(
        `http://${this.config.host}:${this.config.port}/api/v1/commands/?cmd=volume&volume=${volume}`,
        { timeout: 5e3 }
      );
      this.logger.silly(`Volume command response: ${JSON.stringify(response.data)}`);
      if (!((_b = (_a = response.data) == null ? void 0 : _a.response) == null ? void 0 : _b.toLowerCase().includes("success"))) {
        throw new Error(`Volume command failed: ${JSON.stringify(response.data)}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`setVolume() via REST fallback failed: ${errorMessage}`);
      throw error;
    }
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
        const error = "Not connected to Volumio";
        this.logger.error(`sendCommand(${command}) failed: ${error}`);
        reject(new Error(error));
        return;
      }
      this.logger.debug(`Sending command: ${command}${data ? ` with data: ${JSON.stringify(data)}` : ""}`);
      if (command === "getState") {
        this.socket.emit(command);
        const timeout = setTimeout(() => {
          this.logger.warn(`Command ${command} response timeout after 5s`);
          reject(new Error(`Timeout waiting for ${command} response`));
        }, 5e3);
        this.socket.once("pushState", (response) => {
          clearTimeout(timeout);
          this.logger.silly(`Received ${command} response via pushState: ${JSON.stringify(response)}`);
          resolve(response);
        });
      } else {
        if (data) {
          this.socket.emit(command, data);
        } else {
          this.socket.emit(command);
        }
        this.logger.debug(`Command ${command} sent successfully`);
        resolve(void 0);
      }
    });
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
  WebSocketVolumioClient
});
//# sourceMappingURL=websocketVolumioClient.js.map
