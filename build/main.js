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
var import_ip = __toESM(require("ip"));
class Volumio extends utils.Adapter {
  axiosInstance = null;
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
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    this.axiosInstance = import_axios.default.create(
      {
        baseURL: `http://${this.config.host}/api/v1/`,
        timeout: 1e3
      }
    );
    this.setState("info.connection", false, true);
    this.subscribeStates("*");
    const connectionSuccess = await this.pingVolumio();
    if (this.config.checkConnection) {
      let interval = this.config.checkConnectionInterval;
      if (!interval || !isNumber(interval)) {
        this.log.error(`Invalid connection check interval setting. Will be set to 30s`);
        interval = 30;
      }
      this.checkConnectionInterval = setInterval(this.checkConnection, interval * 1e3, this);
    }
    if (connectionSuccess) {
      this.getSystemInfo();
      this.getPlayerState();
    }
    if (this.config.subscribeToStateChanges && this.config.subscriptionPort && connectionSuccess) {
      this.log.debug(`Starting server on ${this.config.subscriptionPort} for subscription mode ...`);
      try {
        this.httpServerInstance = this.httpServer.listen(this.config.subscriptionPort).on("error", (error) => {
          if (error.code === "EADDRINUSE") {
            this.log.error(`Port ${this.config.subscriptionPort} is already in use. Please choose another one. Subscription mode will not be available.`);
            this.config.subscribeToStateChanges = false;
          } else {
            this.log.error(`Starting server on ${this.config.subscriptionPort} for subscription mode failed: ${error}`);
          }
        });
        this.log.debug(`Server is listening on ${import_ip.default.address()}:${this.config.subscriptionPort}`);
        this.subscribeToVolumioNotifications();
      } catch (error) {
        this.log.error(`Starting server on ${this.config.subscriptionPort} for subscription mode failed: ${error}. Subscription mode will not be available.`);
        this.config.subscribeToStateChanges = false;
      }
    } else if (this.config.subscribeToStateChanges && !this.config.subscriptionPort) {
      this.log.error("Subscription mode is activated, but port is not configured.");
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
   */
  onUnload(callback) {
    try {
      this.unsubscribeFromVolumioNotifications();
      if (this.checkConnectionInterval) {
        clearInterval(this.checkConnectionInterval);
        this.checkConnectionInterval = null;
      }
      this.httpServerInstance.close();
      callback();
    } catch (e) {
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
   */
  onStateChange(id, state) {
    if (!state) {
      this.log.info(`state ${id} deleted`);
      return;
    }
    if (state.ack) {
      this.log.silly(`State change of ${id} to "${state.val}" was already acknowledged. No need for further actions`);
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
        this.getStateAsync("playbackInfo.repeatSingle", (err, state2) => {
          if (state2) {
            this.setRepeatTrack(!state2.val);
          }
        });
        break;
      case "playbackInfo.random":
      case "queue.random":
        this.setRandomPlayback(state.val);
        break;
      case "queue.shuffleMode":
        if (!isNumber(state.val)) {
          this.log.warn("queue.shuffleMode state change. Invalid state value passed");
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
      this.log.warn(`Unprocessable state change message received: ${JSON.stringify(msg)}`);
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
    if (urls.includes(`${import_ip.default.address()}:${this.config.subscriptionPort}`)) {
      this.log.debug("Already subscribed to volumio push notifications");
      return;
    }
    const data = { "url": `http://${import_ip.default.address()}:${this.config.subscriptionPort}/volumiostatus` };
    (_a = this.axiosInstance) == null ? void 0 : _a.post("pushNotificationUrls", data).then((response) => {
      var _a2;
      if ((_a2 = response.data) == null ? void 0 : _a2.success) {
        this.log.debug("Subscription to volumio push notifications successful");
      } else {
        this.log.error(`Subscription to volumio push notifications failed: ${JSON.stringify(response == null ? void 0 : response.data)}`);
      }
    }).catch((err) => {
      this.log.error(`Subscription to volumio push notifications failed: ${err.message}`);
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
        this.log.error(`Error receiving pushNotificationUrls: ${err.message}`);
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
    if (!urls.includes(`${import_ip.default.address()}:${this.config.subscriptionPort}`)) {
      this.log.debug("Subscription was not active. No need to unsubscribe");
      return;
    }
    const data = { "url": `http://${import_ip.default.address()}:${this.config.subscriptionPort}/volumiostatus` };
    (_a = this.axiosInstance) == null ? void 0 : _a.delete("pushNotificationUrls", data).then((response) => {
      var _a2;
      if ((_a2 = response.data) == null ? void 0 : _a2.success) {
        this.log.debug("Unsubscription from volumio push notifications successful");
      } else {
        this.log.error(`Unsubscription from volumio push notifications failed: ${JSON.stringify(response == null ? void 0 : response.data)}`);
      }
    }).catch((err) => {
      this.log.error(`Unsubscription from volumio push notifications failed: ${err.message}`);
      this.setStateAsync("info.connection", false, true);
    });
  }
  async pingVolumio() {
    var _a;
    this.log.debug("Pinging volumio ...");
    try {
      this.log.debug("Volumio ping success");
      const response = await ((_a = this.axiosInstance) == null ? void 0 : _a.get("ping"));
      this.setState("info.connection", true, true);
      if ((response == null ? void 0 : response.data) !== "pong") {
        this.log.warn(`Volumio API did not respond correctly to ping. Please report this issue to the developer!`);
      }
      return true;
    } catch (error) {
      this.log.error(`Connection to Volumio host (${this.config.host}) failed: ${error}`);
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
  getSystemInfo() {
    var _a;
    (_a = this.axiosInstance) == null ? void 0 : _a.get("getSystemInfo").then((response) => {
      var _a2;
      this.log.debug(`getSystemInfo response: ${JSON.stringify(response == null ? void 0 : response.data)}`);
      if (response.data) {
        this.updateSystemInfo(response.data);
      }
      if ((_a2 = response.data) == null ? void 0 : _a2.state) {
        this.updatePlayerState(response.data.state);
      }
    }).catch((error) => {
      this.log.error(`Error getting system info: ${error}`);
    });
  }
  getPlayerState() {
    var _a;
    (_a = this.axiosInstance) == null ? void 0 : _a.get("getState").then((response) => {
      this.log.debug(`getState response: ${JSON.stringify(response == null ? void 0 : response.data)}`);
      if (response.data) {
        this.updatePlayerState(response.data);
      }
    }).catch((error) => {
      this.log.error(`Error getting player state: ${error}`);
    });
  }
  updatePlayerState(state) {
    this.log.debug(`Updating player state ...`);
    if (state.status) {
      this.setStateAsync("playbackInfo.status", state.status, true);
    }
    if (state.position) {
      this.setStateAsync("playbackInfo.position", state.position, true);
    }
    if (state.title && state.track) {
      if (state.title !== state.track) {
        this.log.warn(`Title and track attibutes are both set but differ. Title will be set to ${state.title}`);
        this.setStateAsync("playbackInfo.title", state.title, true);
      }
      this.setStateAsync("playbackInfo.title", state.title, true);
    } else if (state.title) {
      this.setStateAsync("playbackInfo.title", state.title, true);
    } else if (state.track) {
      this.setStateAsync("playbackInfo.title", state.track, true);
    }
    if (state.artist) {
      this.setStateAsync("playbackInfo.artist", state.artist, true);
    }
    if (state.album) {
      this.setStateAsync("playbackInfo.album", state.album, true);
    }
    if (state.albumart) {
      this.setStateAsync("playbackInfo.albumart", state.albumart, true);
    }
    if (state.uri) {
      this.setStateAsync("playbackInfo.uri", state.uri, true);
    }
    if (state.trackType) {
      this.setStateAsync("playbackInfo.trackType", state.trackType, true);
    }
    if (state.seek) {
      this.setStateAsync("playbackInfo.seek", state.seek, true);
    }
    if (state.duration) {
      this.log.debug(`Set Duration: ${state.duration}`);
      this.setStateAsync("playbackInfo.duration", state.duration, true);
    }
    if (state.samplerate) {
      this.setStateAsync("playbackInfo.samplerate", state.samplerate, true);
    }
    if (state.bitdepth) {
      this.setStateAsync("playbackInfo.bitdepth", state.bitdepth, true);
    }
    if (state.channels) {
      this.setStateAsync("playbackInfo.channels", state.channels, true);
    }
    if (state.random) {
      this.setStateAsync("playbackInfo.random", state.random, true);
    }
    if (state.repeat) {
      this.setStateAsync("playbackInfo.repeat", state.repeat, true);
    }
    if (state.repeatSingle) {
      this.setStateAsync("playbackInfo.repeatSingle", state.repeatSingle, true);
    }
    if (state.consume) {
      this.setStateAsync("playbackInfo.consume", state.consume, true);
    }
    if (state.volume) {
      this.setStateAsync("playbackInfo.volume", state.volume, true);
    }
    if (state.dbVolume) {
      this.setStateAsync("playbackInfo.dbVolume", state.dbVolume, true);
    }
    if (state.disableVolumeControl) {
      this.setStateAsync("playbackInfo.disableVolumeControl", state.disableVolumeControl, true);
    }
    if (state.mute) {
      this.setStateAsync("playbackInfo.mute", state.mute, true);
    }
    if (state.stream) {
      this.setStateAsync("playbackInfo.stream", state.stream, true);
    }
    if (state.updatedb) {
      this.setStateAsync("playbackInfo.updatedb", state.updatedb, true);
    }
    if (state.volatile) {
      this.setStateAsync("playbackInfo.volatile", state.volatile, true);
    }
    if (state.service) {
      this.setStateAsync("playbackInfo.service", state.service, true);
    }
  }
  updateSystemInfo(systemInfo) {
    if (systemInfo.id) {
      this.setStateAsync("info.id", systemInfo.id, true);
    }
    if (systemInfo.host) {
      this.setStateAsync("info.host", systemInfo.host, true);
    }
    if (systemInfo.name) {
      this.setStateAsync("info.name", systemInfo.name, true);
    }
    if (systemInfo.type) {
      this.setStateAsync("info.type", systemInfo.type, true);
    }
    if (systemInfo.serviceName) {
      this.setStateAsync("info.serviceName", systemInfo.serviceName, true);
    }
    if (systemInfo.systemversion) {
      this.setStateAsync("info.systemversion", systemInfo.systemversion, true);
    }
    if (systemInfo.builddate) {
      this.setStateAsync("info.builddate", systemInfo.builddate, true);
    }
    if (systemInfo.variant) {
      this.setStateAsync("info.variant", systemInfo.variant, true);
    }
    if (systemInfo.hardware) {
      this.setStateAsync("info.hardware", systemInfo.hardware, true);
    }
    if (systemInfo.isPremiumDevice) {
      this.setStateAsync("info.isPremiumDevice", systemInfo.isPremiumDevice, true);
    }
    if (systemInfo.isVolumioProduct) {
      this.setStateAsync("info.isVolumioProduct", systemInfo.isVolumioProduct, true);
    }
  }
  nextTrack() {
    var _a;
    (_a = this.axiosInstance) == null ? void 0 : _a.get("commands/?cmd=next").then((response) => {
      var _a2, _b;
      if ((_b = (_a2 = response.data) == null ? void 0 : _a2.response) == null ? void 0 : _b.toLowerCase().includes("success")) {
        this.log.debug("Next track");
      } else {
        this.log.warn(`Next track failed: ${response.data}`);
      }
    }).catch((error) => {
      this.log.error(`Error playing next track: ${error}`);
    });
  }
  previousTrack() {
    var _a;
    (_a = this.axiosInstance) == null ? void 0 : _a.get("commands/?cmd=prev").then((response) => {
      var _a2, _b;
      if ((_b = (_a2 = response.data) == null ? void 0 : _a2.response) == null ? void 0 : _b.toLowerCase().includes("success")) {
        this.log.debug("Previous track");
      } else {
        this.log.warn(`Previous track failed: ${response.data}`);
      }
    }).catch((error) => {
      this.log.error(`Error playing previous track: ${error}`);
    });
  }
  volumeMute() {
    var _a;
    (_a = this.axiosInstance) == null ? void 0 : _a.get("commands/?cmd=volume&volume=mute").then((response) => {
      var _a2, _b;
      if ((_b = (_a2 = response.data) == null ? void 0 : _a2.response) == null ? void 0 : _b.toLowerCase().includes("success")) {
        this.log.debug("Volume muted");
        this.setStateAsync("playbackInfo.mute", true, true);
        this.setStateAsync("player.mute", true, true);
      } else {
        this.log.warn(`Volume muting failed: ${response.data}`);
      }
    }).catch((error) => {
      this.log.error(`Error muting volume: ${error}`);
    });
  }
  volumeUnmute() {
    var _a;
    (_a = this.axiosInstance) == null ? void 0 : _a.get("commands/?cmd=volume&volume=unmute").then((response) => {
      var _a2, _b;
      if ((_b = (_a2 = response.data) == null ? void 0 : _a2.response) == null ? void 0 : _b.toLowerCase().includes("success")) {
        this.log.debug("Volume unmuted");
        this.setStateAsync("playbackInfo.mute", false, true);
        this.setStateAsync("player.mute", false, true);
      } else {
        this.log.warn(`Volume unmuting failed: ${response.data}`);
      }
    }).catch((error) => {
      this.log.error(`Error unmuting volume: ${error}`);
    });
  }
  playbackPause() {
    var _a;
    (_a = this.axiosInstance) == null ? void 0 : _a.get("commands/?cmd=pause").then((response) => {
      var _a2, _b;
      if ((_b = (_a2 = response.data) == null ? void 0 : _a2.response) == null ? void 0 : _b.toLowerCase().includes("success")) {
        this.log.debug("Playback paused");
        this.setStateAsync("playbackInfo.status", "pause", true);
      } else {
        this.log.warn(`Playback pausing failed: ${response.data}`);
      }
    }).catch((error) => {
      this.log.error(`Error pausing playback: ${error}`);
    });
  }
  playbackPlay(n) {
    var _a;
    if (n && !isNumber(n)) {
      this.log.warn("player.playN state change. Invalid state value passed");
      return;
    }
    const cmdTxt = `play${n ? `&N=${n}` : ``}`;
    (_a = this.axiosInstance) == null ? void 0 : _a.get(`commands/?cmd=${cmdTxt}`).then((response) => {
      var _a2, _b;
      if ((_b = (_a2 = response.data) == null ? void 0 : _a2.response) == null ? void 0 : _b.toLowerCase().includes("success")) {
        this.log.debug("Playback started");
        this.setStateAsync("playbackInfo.status", "play", true);
      } else {
        this.log.warn(`Playback starting failed: ${response.data}`);
      }
    }).catch((error) => {
      this.log.error(`Error starting playback: ${error}`);
    });
  }
  playbackStop() {
    var _a;
    (_a = this.axiosInstance) == null ? void 0 : _a.get("commands/?cmd=stop").then((response) => {
      var _a2, _b;
      if ((_b = (_a2 = response.data) == null ? void 0 : _a2.response) == null ? void 0 : _b.toLowerCase().includes("success")) {
        this.log.debug("Playback stopped");
        this.setStateAsync("playbackInfo.status", "stop", true);
      } else {
        this.log.warn(`Playback stopping failed: ${response.data}`);
      }
    }).catch((error) => {
      this.log.error(`Error stopping playback: ${error}`);
    });
  }
  playbackToggle() {
    var _a;
    (_a = this.axiosInstance) == null ? void 0 : _a.get("commands/?cmd=toggle").then((response) => {
      var _a2, _b;
      if ((_b = (_a2 = response.data) == null ? void 0 : _a2.response) == null ? void 0 : _b.toLowerCase().includes("success")) {
        this.log.debug("Playback toggled");
        this.getState("playbackInfo.status", (err, state) => {
          if ((state == null ? void 0 : state.val) === "play") {
            this.setStateAsync("playbackInfo.status", "pause", true);
          } else if ((state == null ? void 0 : state.val) === "pause" || (state == null ? void 0 : state.val) === "stop") {
            this.setStateAsync("playbackInfo.status", "play", true);
          }
        });
      } else {
        this.log.warn(`Playback toggling failed: ${response.data}`);
      }
    }).catch((error) => {
      this.log.error(`Error toggling playback: ${error}`);
    });
  }
  volumeSetTo(value) {
    var _a;
    if (!isNumber(value)) {
      this.log.warn("player.volume state change. Invalid state value passed");
      return;
    }
    (_a = this.axiosInstance) == null ? void 0 : _a.get(`commands/?cmd=volume&volume=${value}`).then((response) => {
      var _a2, _b;
      if ((_b = (_a2 = response.data) == null ? void 0 : _a2.response) == null ? void 0 : _b.toLowerCase().includes("success")) {
        this.log.debug(`Volume set to ${value}`);
        this.setStateAsync("playbackInfo.volume", value, true);
        this.setStateAsync("player.volume", value);
      } else {
        this.log.warn(`Volume setting failed: ${response.data}`);
      }
    }).catch((error) => {
      this.log.error(`Error setting volume: ${error}`);
    });
  }
  volumeUp() {
    let volumeSteps = this.config.volumeSteps;
    if (!volumeSteps || volumeSteps > 100 || volumeSteps < 0) {
      this.log.warn(`Invalid volume step setting. volumeSteps will be set to 10`);
      volumeSteps = 10;
    }
    let currentVolume = 0;
    this.getState("playbackInfo.volume", (err, state) => {
      if (state) {
        currentVolume = state.val;
      } else {
        this.log.warn("Volume state not found. Setting volume to 0");
        currentVolume = 0;
      }
    });
    const newVolumeValue = currentVolume + volumeSteps > 100 ? 100 : currentVolume + volumeSteps;
    this.volumeSetTo(newVolumeValue);
  }
  volumeDown() {
    let volumeSteps = this.config.volumeSteps;
    if (!volumeSteps || volumeSteps > 100 || volumeSteps < 0) {
      this.log.warn(`Invalid volume step setting. volumeSteps will be set to 10`);
      volumeSteps = 10;
    }
    let currentVolume = 0;
    this.getState("playbackInfo.volume", (err, state) => {
      if (state) {
        currentVolume = state.val;
      } else {
        this.log.warn("Volume state not found. Setting volume to 0");
        currentVolume = 0;
      }
    });
    const newVolumeValue = currentVolume - volumeSteps < 0 ? 0 : currentVolume - volumeSteps;
    this.volumeSetTo(newVolumeValue);
  }
  setRandomPlayback(random) {
    var _a;
    if (typeof random !== "boolean") {
      this.log.warn("player.random state change. Invalid state value passed");
      return;
    }
    (_a = this.axiosInstance) == null ? void 0 : _a.get(`commands/?cmd=random&value=${random}`).then((response) => {
      var _a2, _b;
      if ((_b = (_a2 = response.data) == null ? void 0 : _a2.response) == null ? void 0 : _b.toLowerCase().includes("success")) {
        this.log.debug(`Random play set to ${random}`);
        this.setStateAsync("playbackInfo.random", random, true);
        this.setStateAsync("queue.shuffleMode", random ? 1 : 0, true);
      } else {
        this.log.warn(`Random play setting failed: ${response.data}`);
      }
    }).catch((error) => {
      this.log.error(`Error setting random play: ${error}`);
    });
  }
  clearQueue() {
    var _a;
    (_a = this.axiosInstance) == null ? void 0 : _a.get(`commands/?cmd=clearQueue`).then((response) => {
      var _a2, _b;
      if ((_b = (_a2 = response.data) == null ? void 0 : _a2.response) == null ? void 0 : _b.toLowerCase().includes("success")) {
        this.log.debug(`Queue cleared`);
      } else {
        this.log.warn(`Queue clearing failed: ${response.data}`);
      }
    }).catch((error) => {
      this.log.error(`Error clearing queue: ${error}`);
    });
  }
  setRepeatTrack(repeat) {
    var _a;
    if (typeof repeat !== "boolean") {
      this.log.warn("player.repeatTrackState state change. Invalid state value passed");
      return;
    }
    (_a = this.axiosInstance) == null ? void 0 : _a.get(`commands/?cmd=repeat&value=${repeat}`).then((response) => {
      var _a2, _b;
      if ((_b = (_a2 = response.data) == null ? void 0 : _a2.response) == null ? void 0 : _b.toLowerCase().includes("success")) {
        this.log.debug(`Repeat track set to ${repeat}`);
        this.setStateAsync("playbackInfo.repeatSingle", repeat, true);
        this.setStateAsync("queue.repeatSingle", repeat ? 1 : 0, true);
      } else {
        this.log.warn(`Repeat track setting failed: ${response.data}`);
      }
    }).catch((error) => {
      this.log.error(`Error setting repeat track: ${error}`);
    });
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
