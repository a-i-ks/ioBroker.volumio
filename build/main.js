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
  playerState;
  static namespace = "volumio.0.";
  axiosInstance;
  httpServer;
  httpServerInstance;
  checkConnectionInterval;
  constructor(options = {}) {
    super({
      ...options,
      name: "volumio"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
    this.axiosInstance = import_axios.default.create();
    this.playerState = {};
    this.httpServer = (0, import_express.default)();
    this.httpServer.use(import_body_parser.default.urlencoded({ extended: false }));
    this.httpServer.use(import_body_parser.default.json());
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    this.subscribeStates("*");
    this.axiosInstance = import_axios.default.create({
      baseURL: `http://${this.config.host}/api/v1/`,
      timeout: 1e3
    });
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
      this.apiGet("getSystemInfo").then((sysInfo) => {
        this.setStateAsync("info.id", sysInfo.id, true);
        this.setStateAsync("info.host", sysInfo.host, true);
        this.setStateAsync("info.name", sysInfo.name, true);
        this.setStateAsync("info.type", sysInfo.type, true);
        this.setStateAsync("info.serviceName", sysInfo.serviceName, true);
        this.setStateAsync("info.systemversion", sysInfo.systemversion, true);
        this.setStateAsync("info.builddate", sysInfo.builddate, true);
        this.setStateAsync("info.variant", sysInfo.variant, true);
        this.setStateAsync("info.hardware", sysInfo.hardware, true);
      });
      this.updatePlayerState();
    }
    if (this.config.subscribeToStateChanges && this.config.subscriptionPort && connectionSuccess) {
      this.log.debug("Subscription mode is activated");
      try {
        this.httpServerInstance = this.httpServer.listen(this.config.subscriptionPort);
        this.log.debug(`Server is listening on ${import_ip.default.address()}:${this.config.subscriptionPort}`);
        this.subscribeToVolumioNotifications();
      } catch (error) {
        this.log.error(`Starting server on ${this.config.subscriptionPort} for subscription mode failed: ${error.message}`);
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
  /**
   * Is called if a subscribed state changes
   */
  onStateChange(id, state) {
    if (!id || !state) {
      return;
    }
    if (state.ack) {
      this.log.silly(`State change of ${id} to "${state.val}" was already acknowledged. No need for further actions`);
      return;
    }
    switch (id.replace(`${this.namespace}.`, ``)) {
      case "getPlaybackInfo":
        this.updatePlayerState();
        break;
      case "player.mute":
        this.volumeMute();
        break;
      case "player.unmute":
        this.volumeUnmute();
        break;
      case "player.next":
        this.sendCmd("next");
        break;
      case "player.prev":
        this.sendCmd("prev");
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
        this.sendCmd("clearQueue");
        break;
      case "queue.repeatTrack":
        this.sendCmd("repeat");
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
  sendCmd(cmd) {
    return this.apiGet(`commands/?cmd=${cmd}`);
  }
  async apiGet(url) {
    return this.axiosInstance.get(url).then((res) => {
      if (!res.status) {
        throw new Error(`Error during GET on ${url}: ${res.statusText}`);
      } else if (res.status !== 200) {
        throw new Error(`GET on ${url} returned ${res.status}: ${res.statusText}`);
      }
      return res.data;
    }).catch((error) => {
      throw new Error(`Error during GET on ${url}: ${error.message}`);
    });
  }
  async apiPost(url, data) {
    return await this.axiosInstance.post(url, data).then((res) => {
      if (!res.status) {
        throw new Error(`Error during POST on ${url}: ${res.statusText}`);
      }
      return res.data;
    }).catch((error) => {
      throw new Error(`Error during POST on ${url}: ${error.message}`);
    });
  }
  async apiDelete(url, reqData) {
    return await this.axiosInstance.delete(url, { data: reqData }).then((res) => {
      if (!res.status) {
        throw new Error(`Error during DELETE on ${url}: ${res.statusText}`);
      }
      return res.data;
    }).catch((error) => {
      throw new Error(`Error during DELETE on ${url}: ${error.message}`);
    });
  }
  updatePlayerState() {
    this.apiGet("getState").then((p) => {
      this.playerState = p;
      this.propagatePlayserStateIntoStates(this.playerState);
    }).catch((err) => {
      this.log.error(`Error during update of player state: ${err.message}`);
    });
  }
  propagatePlayserStateIntoStates(playerState) {
    this.setStateAsync("playbackInfo.album", playerState.album, true);
    this.setStateAsync("playbackInfo.albumart", playerState.albumart, true);
    this.setStateAsync("playbackInfo.artist", playerState.artist, true);
    this.setStateAsync("playbackInfo.bitdepth", playerState.bitdepth, true);
    this.setStateAsync("playbackInfo.channels", playerState.channels, true);
    this.setStateAsync("playbackInfo.consume", playerState.consume, true);
    this.setStateAsync("playbackInfo.disableVolumeControl", playerState.disableVolumeControl, true);
    this.setStateAsync("playbackInfo.duration", playerState.duration, true);
    this.setStateAsync("player.muted", playerState.mute, true);
    this.setStateAsync("playbackInfo.mute", playerState.mute, true);
    this.setStateAsync("playbackInfo.position", playerState.position, true);
    this.setStateAsync("playbackInfo.random", playerState.random, true);
    this.setStateAsync("playbackInfo.repeat", playerState.repeat, true);
    this.setStateAsync("playbackInfo.repeatSingle", playerState.repeatSingle, true);
    this.setStateAsync("queue.repeatTrackState", playerState.repeatSingle, true);
    this.setStateAsync("playbackInfo.samplerate", playerState.samplerate, true);
    this.setStateAsync("playbackInfo.seek", playerState.seek, true);
    this.setStateAsync("playbackInfo.service", playerState.service, true);
    this.setStateAsync("playbackInfo.status", playerState.status, true);
    this.setStateAsync("playbackInfo.stream", playerState.stream, true);
    this.setStateAsync("playbackInfo.title", playerState.title, true);
    this.setStateAsync("playbackInfo.trackType", playerState.trackType, true);
    this.setStateAsync("playbackInfo.updatedb", playerState.updatedb, true);
    this.setStateAsync("playbackInfo.uri", playerState.uri, true);
    this.setStateAsync("playbackInfo.volatile", playerState.volatile, true);
    this.setStateAsync("playbackInfo.volume", playerState.volume, true);
    this.setStateAsync("player.volume", playerState.volume, true);
  }
  volumeMute() {
    this.sendCmd("volume&volume=mute").then((r) => {
      if (r.response === "volume Success") {
        this.playerState.mute = true;
        this.setStateAsync("player.muted", this.playerState.mute);
        this.setStateAsync("playbackInfo.mute", this.playerState.mute);
      } else {
        this.log.warn(`Playpack mute was not successful: ${r.response}`);
      }
    });
  }
  volumeUnmute() {
    this.sendCmd("volume&volume=unmute").then((r) => {
      if (r.response === "volume Success") {
        this.playerState.mute = false;
        this.setStateAsync("player.muted", this.playerState.mute);
        this.setStateAsync("playbackInfo.mute", this.playerState.mute);
      } else {
        this.log.warn(`Playpack unmute was not successful: ${r.response}`);
      }
    });
  }
  playbackPause() {
    this.sendCmd("pause").then((r) => {
      if (r.response === "pause Success") {
        this.playerState.status = "pause";
        this.setStateAsync("playbackInfo.status", "pause", true);
      } else {
        this.log.warn(`Playpack pause was not successful: ${r.response}`);
      }
    });
  }
  playbackPlay(n) {
    if (n && !isNumber(n)) {
      this.log.warn("player.playN state change. Invalid state value passed");
      return;
    }
    const cmdTxt = `play${n ? `&N=${n}` : ``}`;
    this.sendCmd(cmdTxt).then((r) => {
      if (r.response === "play Success") {
        this.playerState.status = "play";
        this.setStateAsync("playbackInfo.status", "play", true);
      } else {
        this.log.warn(`Playpack play was not successful: ${r.response}`);
      }
    });
  }
  playbackStop() {
    this.sendCmd("stop").then((r) => {
      if (r.response === "stop Success") {
        this.playerState.status = "stop";
        this.setStateAsync("playbackInfo.status", "stop", true);
      } else {
        this.log.warn(`Playpack stop was not successful: ${r.response}`);
      }
    });
  }
  playbackToggle() {
    this.sendCmd("toggle").then((r) => {
      if (r.response === "toggle Success") {
        if (this.playerState.status == "play") {
          this.playerState.status = "pause";
        } else if (this.playerState.status == "pause" || this.playerState.status == "stop") {
          this.playerState.status = "play";
        }
      } else {
        this.log.warn(`Playpack toggle was not successful: ${r.response}`);
      }
    });
  }
  volumeSetTo(value) {
    if (!isNumber(value)) {
      this.log.warn("volume state change. Invalid state value passed");
      return;
    } else if (!value && value !== 0 || value > 100 || value < 0) {
      this.log.warn("volume state change. Invalid state value passed");
      return;
    }
    this.sendCmd(`volume&volume=${value}`).then((r) => {
      if (r.response === "volume Success") {
        this.playerState.volume = value;
        this.setStateAsync("player.volume", value, true);
        this.setStateAsync("playbackInfo.volume", value, true);
      } else {
        this.log.warn(`Volume change was not successful: ${r.response}`);
      }
    });
  }
  volumeUp() {
    let volumeSteps = this.config.volumeSteps;
    if (!volumeSteps || volumeSteps > 100 || volumeSteps < 0) {
      this.log.warn(`Invalid volume step setting. volumeSteps will be set to 10`);
      volumeSteps = 10;
    }
    if (!this.playerState.volume) {
      this.playerState.volume = 0;
    }
    const newVolumeValue = this.playerState.volume + volumeSteps > 100 ? 100 : this.playerState.volume + volumeSteps;
    this.volumeSetTo(newVolumeValue);
  }
  volumeDown() {
    let volumeSteps = this.config.volumeSteps;
    if (!volumeSteps || volumeSteps > 100 || volumeSteps < 0) {
      this.log.warn(`Invalid volume step setting. volumeSteps will be set to 10`);
      volumeSteps = 10;
    }
    if (!this.playerState.volume) {
      this.playerState.volume = 10;
    }
    const newVolumeValue = this.playerState.volume - volumeSteps < 0 ? 0 : this.playerState.volume - volumeSteps;
    this.volumeSetTo(newVolumeValue);
  }
  setRandomPlayback(val) {
    if (typeof val !== "boolean") {
      this.log.warn("player.random state change. Invalid state value passed");
      return;
    }
    this.sendCmd(`random&value=${val}`).then((r) => {
      if (r.response === "random Success") {
        this.playerState.random = val;
        this.setStateAsync("playbackInfo.random", this.playerState.random, true);
        this.setStateAsync("queue.shuffleMode", val ? 1 : 0, true);
      } else {
        this.log.warn(`Random playback change was not successful: ${r.response}`);
      }
    });
  }
  setRepeatTrack(val) {
    if (typeof val !== "boolean") {
      this.log.warn("player.repeatTrackState state change. Invalid state value passed");
      return;
    }
    this.sendCmd(`repeat&value=${val}`).then((r) => {
      if (r.response === "repeat Success") {
        this.playerState.repeat = val;
      } else {
        this.log.warn(`repeat playback change was not successful: ${r.response}`);
      }
    });
  }
  async subscribeToVolumioNotifications() {
    this.log.debug(`Checking subscrition urls ...`);
    const urls = JSON.stringify(
      await this.apiGet("pushNotificationUrls").catch((err) => {
        this.log.warn(`Error receiving pushNotificationUrls: ${err.message}`);
        this.setStateAsync("info.connection", false, true);
        return "";
      })
    );
    this.setStateAsync("info.connection", true, true);
    if (urls.includes(`${import_ip.default.address()}:${this.config.subscriptionPort}`)) {
      this.log.debug("Already subscribed to volumio push notifications");
      return;
    }
    const data = { "url": `http://${import_ip.default.address()}:${this.config.subscriptionPort}/volumiostatus` };
    const res = await this.apiPost("pushNotificationUrls", data).catch((err) => {
      this.log.error(`Binding subscription url failed: ${err.message}`);
      this.setStateAsync("info.connection", false, true);
    });
    if (!res || !res.success || res.success !== true) {
      this.log.error(`Binding subscription url failed: ${res.error ? res.error : "Unknown error"}`);
      this.setStateAsync("info.connection", false, true);
    }
  }
  async unsubscribeFromVolumioNotifications() {
    const urls = JSON.stringify(await this.apiGet("pushNotificationUrls").catch((err) => {
      this.log.warn(`Error receiving pushNotificationUrls: ${err.message}`);
      this.setStateAsync("info.connection", false, true);
      return "";
    }));
    if (!urls.includes(`${import_ip.default.address()}:${this.config.subscriptionPort}`)) {
      this.log.debug("Subscription was not active. No need to unsubscribe");
      return;
    }
    const data = { "url": `http://${import_ip.default.address()}:${this.config.subscriptionPort}/volumiostatus` };
    const res = await this.apiDelete("pushNotificationUrls", data).catch((err) => {
      this.log.error(`Error unsubscribing from pushNotificationUrls: ${err.message}`);
      this.setStateAsync("info.connection", false, true);
      return "";
    });
    if (!res || !res.success || res.success !== true) {
      this.log.error(`Error unsubscribing from pushNotificationUrls: ${res.error ? res.error : "Unknown error"}`);
    }
  }
  onVolumioStateChange(msg) {
    if (!msg || !msg.item) {
      this.log.warn(`Unprocessable state change message received: ${JSON.stringify(msg)}`);
      return;
    }
    if (msg.item === "state") {
      this.propagatePlayserStateIntoStates(msg.data);
    } else if (msg.item === "queue") {
    } else {
      this.log.warn(`Unknown state change event: '${msg.data}'`);
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
  async pingVolumio() {
    this.log.debug("Pinging volumio ...");
    return this.apiGet("ping").then((pingResp) => {
      this.log.debug("Ping response");
      this.setStateAsync("info.connection", true, true);
      if (pingResp !== "pong") {
        this.log.warn(`Volumio API did not respond correctly to ping. Please report this issue to the developer!`);
      }
      return true;
    }).catch((err) => {
      this.log.warn(`Connection to Volumio host ${this.config.host} failed: ${err.message}`);
      this.setStateAsync("info.connection", false, true);
      return false;
    });
  }
  // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
  // /**
  //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
  //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
  //  */
  // private onMessage(obj: ioBroker.Message): void {
  //     if (typeof obj === 'object' && obj.message) {
  //         if (obj.command === 'send') {
  //             // e.g. send email or pushover or whatever
  //             this.log.info('send command');
  //             // Send response in callback if required
  //             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
  //         }
  //     }
  // }
}
function isNumber(value) {
  return value != null && value !== "" && !isNaN(Number(value.toString()));
}
if (module.parent) {
  module.exports = (options) => new Volumio(options);
} else {
  (() => new Volumio())();
}
//# sourceMappingURL=main.js.map
