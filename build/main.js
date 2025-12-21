"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var utils = __toESM(require("@iobroker/adapter-core"));
var import_axios = __toESM(require("axios"));
var import_body_parser = __toESM(require("body-parser"));
var import_express = __toESM(require("express"));
var os = __toESM(require("os"));
var import_volumioClientFactory = require("./lib/volumioClientFactory");
class Volumio extends utils.Adapter {
  volumioClient = null;
  axiosInstance = null;
  // Only for push notification endpoints (deprecated)
  checkConnectionInterval = null;
  httpServer;
  httpServerInstance;
  constructor(options = {}) {
    super({
      ...options,
      name: "volumio"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
    this.httpServer = (0, import_express.default)();
    this.httpServer.use(import_body_parser.default.urlencoded({ extended: false }));
    this.httpServer.use(import_body_parser.default.json());
  }
  /**
   * Get local IP address for push notifications
   */
  getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      if (iface) {
        for (const alias of iface) {
          if (alias.family === "IPv4" && !alias.internal) {
            return alias.address;
          }
        }
      }
    }
    return "127.0.0.1";
  }
  /**
   * Handle state changes from Volumio client
   *
   * @param state
   */
  handleStateChange(state) {
    this.log.debug(`State change received: ${JSON.stringify(state)}`);
    this.updatePlayerState(state);
  }
  /**
   * Handle connection state changes from Volumio client
   *
   * @param connected
   */
  handleConnectionChange(connected) {
    this.log.info(
      `Connection to Volumio ${connected ? "established" : "lost"}`
    );
    this.setState("info.connection", connected, true);
  }
  /**
   * Connect to Volumio instance
   */
  async connectToVolumio() {
    var _a;
    this.log.debug("Connecting to Volumio ...");
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.connect());
      this.log.info("Successfully connected to Volumio");
      return true;
    } catch (error) {
      this.log.error(`Failed to connect to Volumio: ${error}`);
      return false;
    }
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    const apiMode = this.config.apiMode || "websocket";
    const port = 3e3;
    this.log.info(
      `Initializing Volumio client in ${apiMode.toUpperCase()} mode (host: ${this.config.host || "volumio.local"}:${port})`
    );
    this.volumioClient = import_volumioClientFactory.VolumioClientFactory.create({
      apiMode,
      host: this.config.host || "volumio.local",
      port,
      pollInterval: (this.config.pollInterval || 2) * 1e3,
      // Convert to ms
      reconnectAttempts: this.config.reconnectAttempts || 5,
      reconnectDelay: (this.config.reconnectDelay || 2) * 1e3,
      // Convert to ms
      logger: this.log
      // Pass ioBroker logger to client
    });
    if (apiMode === "rest" && this.config.subscribeToStateChanges) {
      this.axiosInstance = import_axios.default.create({
        baseURL: `http://${this.config.host}/api/v1/`,
        timeout: 5e3
      });
    }
    this.volumioClient.onStateChange(this.handleStateChange.bind(this));
    this.volumioClient.onConnectionChange(
      this.handleConnectionChange.bind(this)
    );
    this.setState("info.connection", false, true);
    this.subscribeStates("*");
    const connectionSuccess = await this.connectToVolumio();
    if (this.config.checkConnection) {
      let interval = this.config.checkConnectionInterval;
      if (!interval || !isNumber(interval)) {
        this.log.error(
          `Invalid connection check interval setting. Will be set to 60s`
        );
        interval = 60;
      }
      this.checkConnectionInterval = setInterval(
        this.checkConnection,
        interval * 1e3,
        this
      );
    }
    if (connectionSuccess) {
      this.getSystemInfo();
      this.getPlayerState();
    }
    if (this.config.subscribeToStateChanges && this.config.subscriptionPort && connectionSuccess) {
      this.log.debug(
        `Starting server on ${this.config.subscriptionPort} for subscription mode ...`
      );
      try {
        this.httpServerInstance = this.httpServer.listen(this.config.subscriptionPort).on("error", (error) => {
          if (error.code === "EADDRINUSE") {
            this.log.error(
              `Port ${this.config.subscriptionPort} is already in use. Please choose another one. Subscription mode will not be available.`
            );
            this.config.subscribeToStateChanges = false;
          } else {
            this.log.error(
              `Starting server on ${this.config.subscriptionPort} for subscription mode failed: ${error}`
            );
          }
        });
        this.log.debug(
          `Server is listening on ${this.getLocalIp()}:${this.config.subscriptionPort}`
        );
        this.subscribeToVolumioNotifications();
      } catch (error) {
        this.log.error(
          `Starting server on ${this.config.subscriptionPort} for subscription mode failed: ${error}. Subscription mode will not be available.`
        );
        this.config.subscribeToStateChanges = false;
      }
    } else if (this.config.subscribeToStateChanges && !this.config.subscriptionPort) {
      this.log.error(
        "Subscription mode is activated, but port is not configured."
      );
    } else if (!this.config.subscribeToStateChanges && connectionSuccess) {
      this.unsubscribeFromVolumioNotifications();
    }
    this.httpServer.post("/volumiostatus", (req, res) => {
      this.onVolumioStateChange(req.body);
      res.sendStatus(200);
    });
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   *
   * @param callback
   */
  async onUnload(callback) {
    try {
      if (this.volumioClient) {
        await this.volumioClient.disconnect();
        this.volumioClient = null;
      }
      if (this.config.subscribeToStateChanges && this.config.apiMode === "rest") {
        this.unsubscribeFromVolumioNotifications();
      }
      if (this.checkConnectionInterval) {
        clearInterval(this.checkConnectionInterval);
        this.checkConnectionInterval = null;
      }
      if (this.httpServerInstance) {
        this.httpServerInstance.close();
      }
      callback();
    } catch (_e) {
      callback();
    }
  }
  // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
  // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
  // /**
  //  * Is called if a subscribed object changes
  //  */
  // private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
  //     if (obj) {
  //         // The object was changed
  //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
  //     } else {
  //         // The object was deleted
  //         this.log.info(`object ${id} deleted`);
  //     }
  // }
  /**
   * Is called if a subscribed state changes
   *
   * @param id
   * @param state
   */
  onStateChange(id, state) {
    if (!state) {
      this.log.info(`state ${id} deleted`);
      return;
    }
    if (state.ack) {
      this.log.silly(
        `State change of ${id} to "${state.val}" was already acknowledged. No need for further actions`
      );
      return;
    }
    this.log.debug(`state ${id} changed to ${state == null ? void 0 : state.val}`);
    const stateId = id.replace(new RegExp(`^volumio.\\d+\\.`), "");
    switch (stateId) {
      case "getPlaybackInfo":
        this.getPlayerState();
        break;
      case "player.mute":
        this.volumeMute();
        break;
      case "player.unmute":
        this.volumeUnmute();
        break;
      case "player.next":
        this.nextTrack();
        break;
      case "player.prev":
        this.previousTrack();
        break;
      case "player.pause":
        this.playbackPause();
        break;
      case "player.play":
        this.playbackPlay();
        break;
      case "player.playN":
        this.playbackPlay(state.val);
        break;
      case "player.stop":
        this.playbackStop();
        break;
      case "player.toggle":
        this.playbackToggle();
        break;
      case "playbackInfo.volume":
      case "player.volume":
        this.volumeSetTo(state.val);
        break;
      case "player.volume.down":
        this.volumeDown();
        break;
      case "player.volume.up":
        this.volumeUp();
        break;
      case "queue.clearQueue":
        this.clearQueue();
        break;
      case "queue.repeatTrack":
        this.getStateAsync(
          "playbackInfo.repeatSingle",
          (err, state2) => {
            if (state2) {
              this.setRepeatTrack(!state2.val);
            }
          }
        );
        break;
      case "playbackInfo.random":
      case "queue.random":
        this.setRandomPlayback(state.val);
        break;
      case "queue.shuffleMode":
        if (!isNumber(state.val)) {
          this.log.warn(
            "queue.shuffleMode state change. Invalid state value passed"
          );
          break;
        }
        if (state.val === 0) {
          this.setRandomPlayback(false);
        } else if (state.val === 1) {
          this.setRandomPlayback(true);
        } else if (state.val === 2) {
          this.log.warn("queue.shuffleMode 2 not implemented yet");
        } else {
          this.log.warn("Invalid value to queue.shuffleMode passed");
        }
        break;
      case "queue.repeatTrackState":
        this.setRepeatTrack(state.val);
        break;
    }
  }
  // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
  // /**
  //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
  //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
  //  */
  // private onMessage(obj: ioBroker.Message): void {
  //     if (typeof obj === "object" && obj.message) {
  //         if (obj.command === "send") {
  //             // e.g. send email or pushover or whatever
  //             this.log.info("send command");
  //             // Send response in callback if required
  //             if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
  //         }
  //     }
  // }
  onVolumioStateChange(msg) {
    this.log.debug(`State change message received: ${JSON.stringify(msg)}`);
    if (!msg || !msg.item) {
      this.log.warn(
        `Unprocessable state change message received: ${JSON.stringify(msg)}`
      );
      return;
    }
    if (msg.item === "state") {
      this.updatePlayerState(msg.data);
    } else if (msg.item === "queue") {
    } else {
      this.log.warn(`Unknown state change event: '${msg.data}'`);
    }
  }
  async subscribeToVolumioNotifications() {
    var _a;
    this.log.debug("Checking subscrition urls ...");
    const urls = await this.getPushNotificationUrls();
    if (!urls) {
      return;
    }
    this.setStateAsync("info.connection", true, true);
    if (urls.includes(`${this.getLocalIp()}:${this.config.subscriptionPort}`)) {
      this.log.debug("Already subscribed to volumio push notifications");
      return;
    }
    const data = {
      url: `http://${this.getLocalIp()}:${this.config.subscriptionPort}/volumiostatus`
    };
    (_a = this.axiosInstance) == null ? void 0 : _a.post("pushNotificationUrls", data).then((response) => {
      var _a2;
      if ((_a2 = response.data) == null ? void 0 : _a2.success) {
        this.log.debug(
          "Subscription to volumio push notifications successful"
        );
      } else {
        this.log.error(
          `Subscription to volumio push notifications failed: ${JSON.stringify(response == null ? void 0 : response.data)}`
        );
      }
    }).catch((err) => {
      this.log.error(
        `Subscription to volumio push notifications failed: ${err.message}`
      );
      this.setStateAsync("info.connection", false, true);
    });
  }
  async getPushNotificationUrls() {
    var _a;
    return JSON.stringify(
      await ((_a = this.axiosInstance) == null ? void 0 : _a.get("pushNotificationUrls").then((response) => {
        return response.data;
      }).catch((err) => {
        this.setStateAsync("info.connection", false, true);
        this.log.error(
          `Error receiving pushNotificationUrls: ${err.message}`
        );
        return null;
      }))
    );
  }
  async unsubscribeFromVolumioNotifications() {
    var _a;
    this.log.debug("Unsubscribing from volumio push notifications ...");
    const urls = await this.getPushNotificationUrls();
    if (!urls) {
      return;
    }
    if (!urls.includes(`${this.getLocalIp()}:${this.config.subscriptionPort}`)) {
      this.log.debug("Subscription was not active. No need to unsubscribe");
      return;
    }
    const data = {
      url: `http://${this.getLocalIp()}:${this.config.subscriptionPort}/volumiostatus`
    };
    (_a = this.axiosInstance) == null ? void 0 : _a.delete("pushNotificationUrls", data).then((response) => {
      var _a2;
      if ((_a2 = response.data) == null ? void 0 : _a2.success) {
        this.log.debug(
          "Unsubscription from volumio push notifications successful"
        );
      } else {
        this.log.error(
          `Unsubscription from volumio push notifications failed: ${JSON.stringify(response == null ? void 0 : response.data)}`
        );
      }
    }).catch((err) => {
      this.log.error(
        `Unsubscription from volumio push notifications failed: ${err.message}`
      );
      this.setStateAsync("info.connection", false, true);
    });
  }
  async pingVolumio() {
    var _a;
    this.log.debug("Pinging volumio ...");
    try {
      const result = await ((_a = this.volumioClient) == null ? void 0 : _a.ping());
      if (result) {
        this.log.debug("Volumio ping success");
        this.setState("info.connection", true, true);
        return true;
      }
      this.setState("info.connection", false, true);
      return false;
    } catch (error) {
      this.log.error(
        `Connection to Volumio host (${this.config.host}) failed: ${error}`
      );
      this.setState("info.connection", false, true);
      return false;
    }
  }
  checkConnection(context) {
    context.log.debug("Checking connection to Volumio ...");
    if (context.config.subscribeToStateChanges) {
      context.subscribeToVolumioNotifications();
    } else {
      context.pingVolumio();
    }
  }
  async getSystemInfo() {
    var _a;
    try {
      const info = await ((_a = this.volumioClient) == null ? void 0 : _a.getSystemInfo());
      this.log.debug(`getSystemInfo response: ${JSON.stringify(info)}`);
      if (info) {
        this.updateSystemInfo(info);
      }
    } catch (error) {
      this.log.error(`Error getting system info: ${error}`);
    }
  }
  async getPlayerState() {
    var _a;
    try {
      const state = await ((_a = this.volumioClient) == null ? void 0 : _a.getState());
      this.log.debug(`getState response: ${JSON.stringify(state)}`);
      if (state) {
        this.updatePlayerState(state);
      }
    } catch (error) {
      this.log.error(`Error getting player state: ${error}`);
    }
  }
  updatePlayerState(state) {
    if (state.status !== void 0) {
      this.setStateAsync("playbackInfo.status", state.status, true);
    }
    if (state.position !== void 0) {
      this.setStateAsync("playbackInfo.position", String(state.position), true);
    }
    if (state.title !== void 0 && state.track !== void 0) {
      if (state.title !== state.track) {
        this.log.warn(
          `Title and track attibutes are both set but differ. Title will be set to ${state.title}`
        );
        this.setStateAsync("playbackInfo.title", state.title, true);
      }
      this.setStateAsync("playbackInfo.title", state.title, true);
    } else if (state.title !== void 0) {
      this.setStateAsync("playbackInfo.title", state.title, true);
    } else if (state.track !== void 0) {
      this.setStateAsync("playbackInfo.title", state.track, true);
    }
    if (state.artist !== void 0) {
      this.setStateAsync("playbackInfo.artist", state.artist, true);
    }
    if (state.album !== void 0) {
      this.setStateAsync("playbackInfo.album", state.album, true);
    }
    if (state.albumart !== void 0) {
      this.setStateAsync("playbackInfo.albumart", state.albumart, true);
    }
    if (state.uri !== void 0) {
      this.setStateAsync("playbackInfo.uri", state.uri, true);
    }
    if (state.trackType !== void 0) {
      this.setStateAsync("playbackInfo.trackType", state.trackType, true);
    }
    if (state.codec !== void 0) {
      this.setStateAsync("playbackInfo.codec", state.codec, true);
    }
    if (state.seek !== void 0) {
      this.setStateAsync("playbackInfo.seek", state.seek, true);
    }
    if (state.duration !== void 0) {
      this.setStateAsync("playbackInfo.duration", state.duration, true);
    }
    if (state.samplerate !== void 0) {
      this.setStateAsync("playbackInfo.samplerate", state.samplerate, true);
    }
    if (state.bitdepth !== void 0) {
      this.setStateAsync("playbackInfo.bitdepth", state.bitdepth, true);
    }
    if (state.channels !== void 0) {
      const channels = typeof state.channels === "string" ? parseInt(state.channels, 10) : state.channels;
      this.setStateAsync("playbackInfo.channels", channels, true);
    }
    if (state.random !== void 0) {
      this.setStateAsync("playbackInfo.random", state.random, true);
    }
    if (state.repeat !== void 0) {
      this.setStateAsync("playbackInfo.repeat", state.repeat, true);
    }
    if (state.repeatSingle !== void 0) {
      this.setStateAsync("playbackInfo.repeatSingle", state.repeatSingle, true);
    }
    if (state.consume !== void 0) {
      this.setStateAsync("playbackInfo.consume", state.consume, true);
    }
    if (state.volume) {
      this.setStateAsync("playbackInfo.volume", state.volume, true);
      this.setStateAsync("player.volume", state.volume, true);
    }
    if (state.dbVolume) {
      this.setStateAsync("playbackInfo.dbVolume", state.dbVolume, true);
    }
    if (state.disableVolumeControl !== void 0) {
      this.setStateAsync(
        "playbackInfo.disableVolumeControl",
        state.disableVolumeControl,
        true
      );
    }
    if (state.mute !== void 0) {
      this.setStateAsync("playbackInfo.mute", state.mute, true);
      this.setStateAsync("player.muted", state.mute, true);
    }
    if (state.stream !== void 0) {
      this.setStateAsync("playbackInfo.stream", state.stream, true);
    }
    if (state.updatedb !== void 0) {
      this.setStateAsync("playbackInfo.updatedb", state.updatedb, true);
    }
    if (state.volatile !== void 0) {
      this.setStateAsync("playbackInfo.volatile", state.volatile, true);
    }
    if (state.service !== void 0) {
      this.setStateAsync("playbackInfo.service", state.service, true);
    }
  }
  updateSystemInfo(systemInfo) {
    if (systemInfo.id !== void 0) {
      this.setStateAsync("info.id", systemInfo.id, true);
    }
    if (systemInfo.host !== void 0) {
      this.setStateAsync("info.host", systemInfo.host, true);
    }
    if (systemInfo.name !== void 0) {
      this.setStateAsync("info.name", systemInfo.name, true);
    }
    if (systemInfo.type !== void 0) {
      this.setStateAsync("info.type", systemInfo.type, true);
    }
    if (systemInfo.serviceName !== void 0) {
      this.setStateAsync("info.serviceName", systemInfo.serviceName, true);
    }
    if (systemInfo.systemversion !== void 0) {
      this.setStateAsync("info.systemversion", systemInfo.systemversion, true);
    }
    if (systemInfo.builddate !== void 0) {
      this.setStateAsync("info.builddate", systemInfo.builddate, true);
    }
    if (systemInfo.variant !== void 0) {
      this.setStateAsync("info.variant", systemInfo.variant, true);
    }
    if (systemInfo.hardware !== void 0) {
      this.setStateAsync("info.hardware", systemInfo.hardware, true);
    }
    if (systemInfo.isPremiumDevice !== void 0) {
      this.setStateAsync(
        "info.isPremiumDevice",
        systemInfo.isPremiumDevice,
        true
      );
    }
    if (systemInfo.isVolumioProduct !== void 0) {
      this.setStateAsync(
        "info.isVolumioProduct",
        systemInfo.isVolumioProduct,
        true
      );
    }
  }
  async nextTrack() {
    var _a;
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.next());
      this.log.debug("Next track");
    } catch (error) {
      this.log.error(`Error playing next track: ${error}`);
    }
  }
  async previousTrack() {
    var _a;
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.previous());
      this.log.debug("Previous track");
    } catch (error) {
      this.log.error(`Error playing previous track: ${error}`);
    }
  }
  async volumeMute() {
    var _a;
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.mute());
      this.log.debug("Volume muted");
      this.setStateAsync("playbackInfo.mute", true, true);
      this.setStateAsync("player.muted", true, true);
    } catch (error) {
      this.log.error(`Error muting volume: ${error}`);
    }
  }
  async volumeUnmute() {
    var _a;
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.unmute());
      this.log.debug("Volume unmuted");
      this.setStateAsync("playbackInfo.mute", false, true);
      this.setStateAsync("player.muted", false, true);
    } catch (error) {
      this.log.error(`Error unmuting volume: ${error}`);
    }
  }
  async playbackPause() {
    var _a;
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.pause());
      this.log.debug("Playback paused");
      this.setStateAsync("playbackInfo.status", "pause", true);
    } catch (error) {
      this.log.error(`Error pausing playback: ${error}`);
    }
  }
  async playbackPlay(n) {
    var _a;
    if (n && !isNumber(n)) {
      this.log.warn("player.playN state change. Invalid state value passed");
      return;
    }
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.play(n));
      this.log.debug("Playback started");
      this.setStateAsync("playbackInfo.status", "play", true);
    } catch (error) {
      this.log.error(`Error starting playback: ${error}`);
    }
  }
  async playbackStop() {
    var _a;
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.stop());
      this.log.debug("Playback stopped");
      this.setStateAsync("playbackInfo.status", "stop", true);
    } catch (error) {
      this.log.error(`Error stopping playback: ${error}`);
    }
  }
  async playbackToggle() {
    var _a;
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.toggle());
      this.log.debug("Playback toggled");
      this.getState("playbackInfo.status", (_err, state) => {
        if ((state == null ? void 0 : state.val) === "play") {
          this.setStateAsync("playbackInfo.status", "pause", true);
        } else if ((state == null ? void 0 : state.val) === "pause" || (state == null ? void 0 : state.val) === "stop") {
          this.setStateAsync("playbackInfo.status", "play", true);
        }
      });
    } catch (error) {
      this.log.error(`Error toggling playback: ${error}`);
    }
  }
  async volumeSetTo(value) {
    var _a;
    if (!isNumber(value)) {
      this.log.warn("player.volume state change. Invalid state value passed");
      return;
    }
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.setVolume(value));
      this.log.debug(`Volume set to ${value}`);
      this.setStateAsync("playbackInfo.volume", value, true);
      this.setStateAsync("player.volume", value, true);
    } catch (error) {
      this.log.error(`Error setting volume: ${error}`);
    }
  }
  async volumeUp() {
    var _a;
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.volumePlus());
      this.log.debug("Volume increased");
    } catch (error) {
      this.log.error(`Error increasing volume: ${error}`);
    }
  }
  async volumeDown() {
    var _a;
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.volumeMinus());
      this.log.debug("Volume decreased");
    } catch (error) {
      this.log.error(`Error decreasing volume: ${error}`);
    }
  }
  async setRandomPlayback(random) {
    var _a;
    if (typeof random !== "boolean") {
      this.log.warn("player.random state change. Invalid state value passed");
      return;
    }
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.setRandom(random));
      this.log.debug(`Random play set to ${random}`);
      this.setStateAsync("playbackInfo.random", random, true);
      this.setStateAsync("queue.shuffleMode", random ? 1 : 0, true);
    } catch (error) {
      this.log.error(`Error setting random play: ${error}`);
    }
  }
  async clearQueue() {
    var _a;
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.clearQueue());
      this.log.debug(`Queue cleared`);
    } catch (error) {
      this.log.error(`Error clearing queue: ${error}`);
    }
  }
  async setRepeatTrack(repeat) {
    var _a;
    if (typeof repeat !== "boolean") {
      this.log.warn(
        "player.repeatTrackState state change. Invalid state value passed"
      );
      return;
    }
    try {
      await ((_a = this.volumioClient) == null ? void 0 : _a.setRepeatSingle(repeat));
      this.log.debug(`Repeat track set to ${repeat}`);
      this.setStateAsync("playbackInfo.repeatSingle", repeat, true);
      this.setStateAsync("queue.repeatSingle", repeat ? 1 : 0, true);
    } catch (error) {
      this.log.error(`Error setting repeat track: ${error}`);
    }
  }
}
function isNumber(value) {
  return value != null && value !== "" && !isNaN(Number(value.toString()));
}
if (require.main !== module) {
  module.exports = (options) => new Volumio(options);
} else {
  (() => new Volumio())();
}
//# sourceMappingURL=main.js.map
