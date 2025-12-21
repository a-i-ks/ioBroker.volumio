/*
 * Created with @iobroker/create-adapter v2.6.3
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";
import type { AxiosInstance } from "axios";
import axios from "axios";
import bodyParser from "body-parser";
import express from "express";
import * as os from "os";
import type { IVolumioClient, VolumioState } from "./lib/volumioClient";
import { VolumioClientFactory } from "./lib/volumioClientFactory";
import type { ApiMode } from "./lib/volumioClientFactory";

// Extend adapter config interface with new properties
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace ioBroker {
    interface AdapterConfig {
      host: string;
      apiMode: ApiMode;
      pollInterval: number;
      reconnectAttempts: number;
      reconnectDelay: number;
      subscribeToStateChanges: boolean;
      subscriptionPort: number;
      volumeSteps: number;
      checkConnection: boolean;
      checkConnectionInterval: number;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

class Volumio extends utils.Adapter {
  private volumioClient: IVolumioClient | null = null;
  private axiosInstance: AxiosInstance | null = null; // Only for push notification endpoints (deprecated)
  private checkConnectionInterval: NodeJS.Timeout | null = null;
  private httpServer;
  private httpServerInstance: any;

  public constructor(options: Partial<utils.AdapterOptions> = {}) {
    super({
      ...options,
      name: "volumio",
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    // this.on("objectChange", this.onObjectChange.bind(this));
    // this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));

    this.httpServer = express();
    this.httpServer.use(bodyParser.urlencoded({ extended: false }));
    this.httpServer.use(bodyParser.json());
  }

  /**
   * Get local IP address for push notifications
   */
  private getLocalIp(): string {
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
    return "127.0.0.1"; // Fallback to localhost
  }

  /**
   * Handle state changes from Volumio client
   *
   * @param state
   */
  private handleStateChange(state: VolumioState): void {
    this.log.debug(`State change received: ${JSON.stringify(state)}`);
    this.updatePlayerState(state);
  }

  /**
   * Handle connection state changes from Volumio client
   *
   * @param connected
   */
  private async handleConnectionChange(connected: boolean): Promise<void> {
    this.log.info(
      `Connection to Volumio ${connected ? "established" : "lost"}`,
    );
    await this.setStateAsync("info.connection", connected, true);
  }

  /**
   * Connect to Volumio instance
   */
  private async connectToVolumio(): Promise<boolean> {
    this.log.debug("Connecting to Volumio ...");
    try {
      await this.volumioClient?.connect();
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
  private async onReady(): Promise<void> {
    // Initialize your adapter here

    // Setup Volumio client using factory
    const apiMode: ApiMode = this.config.apiMode || "websocket";
    const port = 3000; // Default Volumio port

    this.log.info(
      `Initializing Volumio client in ${apiMode.toUpperCase()} mode (host: ${this.config.host || "volumio.local"}:${port})`,
    );

    this.volumioClient = VolumioClientFactory.create({
      apiMode: apiMode,
      host: this.config.host || "volumio.local",
      port: port,
      pollInterval: (this.config.pollInterval || 2) * 1000, // Convert to ms
      reconnectAttempts: this.config.reconnectAttempts || 5,
      reconnectDelay: (this.config.reconnectDelay || 2) * 1000, // Convert to ms
      logger: this.log, // Pass ioBroker logger to client
    });

    // Setup axios instance for push notification endpoints (deprecated, REST-only)
    if (apiMode === "rest" && this.config.subscribeToStateChanges) {
      this.axiosInstance = axios.create({
        baseURL: `http://${this.config.host}/api/v1/`,
        timeout: 5000,
      });
    }

    // Register callbacks
    this.volumioClient.onStateChange(this.handleStateChange.bind(this));
    this.volumioClient.onConnectionChange(
      this.handleConnectionChange.bind(this),
    );

    // Ensure connection state object exists and reset the connection indicator during startup
    await this.setObjectNotExistsAsync("info.connection", {
      type: "state",
      common: {
        role: "indicator.connected",
        name: "Connection state to Volumio instance",
        type: "boolean",
        read: true,
        write: false,
        def: false,
      },
      native: {},
    });
    await this.setStateAsync("info.connection", false, true);

    // Subscribe to all state changes in the 'volumio' namespace
    this.subscribeStates("*");

    // Try to connect to Volumio
    const connectionSuccess = await this.connectToVolumio();

    // Setup connection check interval
    if (this.config.checkConnection) {
      let interval = this.config.checkConnectionInterval;
      if (!interval || !isNumber(interval)) {
        this.log.error(
          `Invalid connection check interval setting. Will be set to 60s`,
        );
        interval = 60;
      }
      this.checkConnectionInterval = setInterval(
        this.checkConnection,
        interval * 1000,
        this,
      );
    }

    // get system infos
    if (connectionSuccess) {
      this.getSystemInfo();
      // get inital player state
      this.getPlayerState();
    }

    // setup subscription mode if enabled
    if (
      this.config.subscribeToStateChanges &&
      this.config.subscriptionPort &&
      connectionSuccess
    ) {
      this.log.debug(
        `Starting server on ${this.config.subscriptionPort} for subscription mode ...`,
      );
      try {
        this.httpServerInstance = this.httpServer
          .listen(this.config.subscriptionPort)
          .on("error", (error: any) => {
            if (error.code === "EADDRINUSE") {
              this.log.error(
                `Port ${this.config.subscriptionPort} is already in use. Please choose another one. Subscription mode will not be available.`,
              );
              this.config.subscribeToStateChanges = false;
            } else {
              this.log.error(
                `Starting server on ${this.config.subscriptionPort} for subscription mode failed: ${error}`,
              );
            }
          });
        this.log.debug(
          `Server is listening on ${this.getLocalIp()}:${this.config.subscriptionPort}`,
        );
        this.subscribeToVolumioNotifications();
      } catch (error) {
        this.log.error(
          `Starting server on ${this.config.subscriptionPort} for subscription mode failed: ${error}. Subscription mode will not be available.`,
        );
        this.config.subscribeToStateChanges = false;
      }
    } else if (
      this.config.subscribeToStateChanges &&
      !this.config.subscriptionPort
    ) {
      this.log.error(
        "Subscription mode is activated, but port is not configured.",
      );
    } else if (!this.config.subscribeToStateChanges && connectionSuccess) {
      this.unsubscribeFromVolumioNotifications();
    }

    this.httpServer.post("/volumiostatus", (req, res) => {
      this.onVolumioStateChange(req.body);
      res.sendStatus(200);
    });

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // this.config:
    // this.log.info("config option1: " + this.config.option1);
    // this.log.info("config option2: " + this.config.option2);

    /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
    // await this.setObjectNotExistsAsync("testVariable", {
    //     type: "state",
    //     common: {
    //         name: "testVariable",
    //         type: "boolean",
    //         role: "indicator",
    //         read: true,
    //         write: true,
    //     },
    //     native: {},
    // });

    // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
    // this.subscribeStates("testVariable");
    // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
    // this.subscribeStates("lights.*");
    // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
    // this.subscribeStates("*");

    /*
            setState examples
            you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
        */
    // the variable testVariable is set to true as command (ack=false)
    // await this.setStateAsync("testVariable", true);

    // same thing, but the value is flagged "ack"
    // ack should be always set to true if the value is received from or acknowledged from the target system
    // await this.setStateAsync("testVariable", { val: true, ack: true });

    // same thing, but the state is deleted after 30s (getState will return null afterwards)
    // await this.setStateAsync("testVariable", { val: true, ack: true, expire: 30 });

    // examples for the checkPassword/checkGroup functions
    // let result = await this.checkPasswordAsync("admin", "iobroker");
    // this.log.info("check user admin pw iobroker: " + result);

    // result = await this.checkGroupAsync("admin", "admin");
    // this.log.info("check group user admin group admin: " + result);
  }

  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   *
   * @param callback
   */
  private async onUnload(callback: () => void): Promise<void> {
    try {
      // Disconnect Volumio client
      if (this.volumioClient) {
        await this.volumioClient.disconnect();
        this.volumioClient = null;
      }

      // Unsubscribe from push notifications (deprecated, REST-only)
      if (
        this.config.subscribeToStateChanges &&
        this.config.apiMode === "rest"
      ) {
        this.unsubscribeFromVolumioNotifications();
      }

      // Clear connection check interval
      if (this.checkConnectionInterval) {
        clearInterval(this.checkConnectionInterval);
        this.checkConnectionInterval = null;
      }

      // Terminate express http server (used for push notifications in REST mode)
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
  private onStateChange(
    id: string,
    state: ioBroker.State | null | undefined,
  ): void {
    if (!state) {
      this.log.info(`state ${id} deleted`);
      return;
    }

    if (state.ack) {
      this.log.silly(
        `State change of ${id} to "${state.val}" was already acknowledged. No need for further actions`,
      );
      return;
    }

    this.log.debug(`state ${id} changed to ${state?.val}`);
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
        // toggle repeat track state
        this.getStateAsync(
          "playbackInfo.repeatSingle",
          (err: any, state: { val: any }) => {
            if (state) {
              this.setRepeatTrack(!state.val);
            }
          },
        );
        break;
      case "playbackInfo.random":
      case "queue.random":
        this.setRandomPlayback(state.val);
        break;
      case "queue.shuffleMode":
        if (!isNumber(state.val)) {
          this.log.warn(
            "queue.shuffleMode state change. Invalid state value passed",
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

  private onVolumioStateChange(msg: any): void {
    this.log.debug(`State change message received: ${JSON.stringify(msg)}`);
    if (!msg || !msg.item) {
      this.log.warn(
        `Unprocessable state change message received: ${JSON.stringify(msg)}`,
      );
      return;
    }
    if (msg.item === "state") {
      this.updatePlayerState(msg.data);
    } else if (msg.item === "queue") {
      // not implemented yet
    } else {
      this.log.warn(`Unknown state change event: '${msg.data}'`);
    }
  }

  private async subscribeToVolumioNotifications(): Promise<void> {
    // check if already subscribed
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
    // enter local http server as notification url
    const data = {
      url: `http://${this.getLocalIp()}:${this.config.subscriptionPort}/volumiostatus`,
    };
    this.axiosInstance
      ?.post("pushNotificationUrls", data)
      .then((response) => {
        if (response.data?.success) {
          this.log.debug(
            "Subscription to volumio push notifications successful",
          );
        } else {
          this.log.error(
            `Subscription to volumio push notifications failed: ${JSON.stringify(response?.data)}`,
          );
        }
      })
      .catch((err) => {
        this.log.error(
          `Subscription to volumio push notifications failed: ${err.message}`,
        );
        this.setStateAsync("info.connection", false, true);
      });
  }

  private async getPushNotificationUrls(): Promise<string | null> {
    return JSON.stringify(
      await this.axiosInstance
        ?.get("pushNotificationUrls")
        .then((response) => {
          return response.data;
        })
        .catch((err) => {
          this.setStateAsync("info.connection", false, true);
          this.log.error(
            `Error receiving pushNotificationUrls: ${err.message}`,
          );
          return null;
        }),
    );
  }

  private async unsubscribeFromVolumioNotifications(): Promise<void> {
    this.log.debug("Unsubscribing from volumio push notifications ...");
    // check if was subscribed
    const urls = await this.getPushNotificationUrls();
    if (!urls) {
      return;
    }
    if (
      !urls.includes(`${this.getLocalIp()}:${this.config.subscriptionPort}`)
    ) {
      this.log.debug("Subscription was not active. No need to unsubscribe");
      return;
    }
    // remove local http server from notification urls
    const data = {
      url: `http://${this.getLocalIp()}:${this.config.subscriptionPort}/volumiostatus`,
    };
    this.axiosInstance
      ?.delete("pushNotificationUrls", data)
      .then((response) => {
        if (response.data?.success) {
          this.log.debug(
            "Unsubscription from volumio push notifications successful",
          );
        } else {
          this.log.error(
            `Unsubscription from volumio push notifications failed: ${JSON.stringify(response?.data)}`,
          );
        }
      })
      .catch((err) => {
        this.log.error(
          `Unsubscription from volumio push notifications failed: ${err.message}`,
        );
        this.setStateAsync("info.connection", false, true);
      });
  }

  async pingVolumio(): Promise<boolean> {
    this.log.debug("Pinging volumio ...");
    try {
      const result = await this.volumioClient?.ping();
      if (result) {
        this.log.debug("Volumio ping success");
        this.setState("info.connection", true, true);
        return true;
      }
      this.setState("info.connection", false, true);
      return false;
    } catch (error) {
      this.log.error(
        `Connection to Volumio host (${this.config.host}) failed: ${error}`,
      );
      this.setState("info.connection", false, true);
      return false;
    }
  }

  private checkConnection(context: any): void {
    context.log.debug("Checking connection to Volumio ...");
    if (context.config.subscribeToStateChanges) {
      context.subscribeToVolumioNotifications();
    } else {
      context.pingVolumio();
    }
  }

  private async getSystemInfo(): Promise<void> {
    try {
      const info = await this.volumioClient?.getSystemInfo();
      this.log.debug(`getSystemInfo response: ${JSON.stringify(info)}`);
      if (info) {
        this.updateSystemInfo(info);
      }
    } catch (error) {
      this.log.error(`Error getting system info: ${error}`);
    }
  }

  private async getPlayerState(): Promise<void> {
    try {
      const state = await this.volumioClient?.getState();
      this.log.debug(`getState response: ${JSON.stringify(state)}`);
      if (state) {
        this.updatePlayerState(state);
      }
    } catch (error) {
      this.log.error(`Error getting player state: ${error}`);
    }
  }

  private updatePlayerState(state: any): void {
    if (state.status !== undefined) {
      this.setStateAsync("playbackInfo.status", state.status, true);
    }
    if (state.position !== undefined) {
      this.setStateAsync("playbackInfo.position", String(state.position), true);
    }
    if (state.title !== undefined && state.track !== undefined) {
      if (state.title !== state.track) {
        this.log.warn(
          `Title and track attibutes are both set but differ. Title will be set to ${state.title}`,
        );
        this.setStateAsync("playbackInfo.title", state.title, true);
      }
      this.setStateAsync("playbackInfo.title", state.title, true);
    } else if (state.title !== undefined) {
      this.setStateAsync("playbackInfo.title", state.title, true);
    } else if (state.track !== undefined) {
      this.setStateAsync("playbackInfo.title", state.track, true);
    }
    if (state.artist !== undefined) {
      this.setStateAsync("playbackInfo.artist", state.artist, true);
    }
    if (state.album !== undefined) {
      this.setStateAsync("playbackInfo.album", state.album, true);
    }
    if (state.albumart !== undefined) {
      this.setStateAsync("playbackInfo.albumart", state.albumart, true);
    }
    if (state.uri !== undefined) {
      this.setStateAsync("playbackInfo.uri", state.uri, true);
    }
    if (state.trackType !== undefined) {
      this.setStateAsync("playbackInfo.trackType", state.trackType, true);
    }
    if (state.codec !== undefined) {
      this.setStateAsync("playbackInfo.codec", state.codec, true);
    }
    if (state.seek !== undefined) {
      this.setStateAsync("playbackInfo.seek", state.seek, true);
    }
    if (state.duration !== undefined) {
      this.setStateAsync("playbackInfo.duration", state.duration, true);
    }
    if (state.samplerate !== undefined) {
      this.setStateAsync("playbackInfo.samplerate", state.samplerate, true);
    }
    if (state.bitdepth !== undefined) {
      this.setStateAsync("playbackInfo.bitdepth", state.bitdepth, true);
    }
    if (state.channels !== undefined) {
      const channels = typeof state.channels === "string" ? parseInt(state.channels, 10) : state.channels;
      this.setStateAsync("playbackInfo.channels", channels, true);
    }
    if (state.random !== undefined) {
      this.setStateAsync("playbackInfo.random", state.random, true);
    }
    if (state.repeat !== undefined) {
      this.setStateAsync("playbackInfo.repeat", state.repeat, true);
    }
    if (state.repeatSingle !== undefined) {
      this.setStateAsync("playbackInfo.repeatSingle", state.repeatSingle, true);
    }
    if (state.consume !== undefined) {
      this.setStateAsync("playbackInfo.consume", state.consume, true);
    }
    if (state.volume) {
      this.setStateAsync("playbackInfo.volume", state.volume, true);
      this.setStateAsync("player.volume", state.volume, true);
    }
    if (state.dbVolume) {
      this.setStateAsync("playbackInfo.dbVolume", state.dbVolume, true);
    }
    if (state.disableVolumeControl !== undefined) {
      this.setStateAsync(
        "playbackInfo.disableVolumeControl",
        state.disableVolumeControl,
        true,
      );
    }
    if (state.mute !== undefined) {
      this.setStateAsync("playbackInfo.mute", state.mute, true);
      this.setStateAsync("player.muted", state.mute, true);
    }
    if (state.stream !== undefined) {
      this.setStateAsync("playbackInfo.stream", state.stream, true);
    }
    if (state.updatedb !== undefined) {
      this.setStateAsync("playbackInfo.updatedb", state.updatedb, true);
    }
    if (state.volatile !== undefined) {
      this.setStateAsync("playbackInfo.volatile", state.volatile, true);
    }
    if (state.service !== undefined) {
      this.setStateAsync("playbackInfo.service", state.service, true);
    }
  }

  private updateSystemInfo(systemInfo: any): void {
    if (systemInfo.id !== undefined) {
      this.setStateAsync("info.id", systemInfo.id, true);
    }
    if (systemInfo.host !== undefined) {
      this.setStateAsync("info.host", systemInfo.host, true);
    }
    if (systemInfo.name !== undefined) {
      this.setStateAsync("info.name", systemInfo.name, true);
    }
    if (systemInfo.type !== undefined) {
      this.setStateAsync("info.type", systemInfo.type, true);
    }
    if (systemInfo.serviceName !== undefined) {
      this.setStateAsync("info.serviceName", systemInfo.serviceName, true);
    }
    if (systemInfo.systemversion !== undefined) {
      this.setStateAsync("info.systemversion", systemInfo.systemversion, true);
    }
    if (systemInfo.builddate !== undefined) {
      this.setStateAsync("info.builddate", systemInfo.builddate, true);
    }
    if (systemInfo.variant !== undefined) {
      this.setStateAsync("info.variant", systemInfo.variant, true);
    }
    if (systemInfo.hardware !== undefined) {
      this.setStateAsync("info.hardware", systemInfo.hardware, true);
    }
    if (systemInfo.isPremiumDevice !== undefined) {
      this.setStateAsync(
        "info.isPremiumDevice",
        systemInfo.isPremiumDevice,
        true,
      );
    }
    if (systemInfo.isVolumioProduct !== undefined) {
      this.setStateAsync(
        "info.isVolumioProduct",
        systemInfo.isVolumioProduct,
        true,
      );
    }
  }

  private async nextTrack(): Promise<void> {
    try {
      await this.volumioClient?.next();
      this.log.debug("Next track");
    } catch (error) {
      this.log.error(`Error playing next track: ${error}`);
    }
  }

  private async previousTrack(): Promise<void> {
    try {
      await this.volumioClient?.previous();
      this.log.debug("Previous track");
    } catch (error) {
      this.log.error(`Error playing previous track: ${error}`);
    }
  }

  private async volumeMute(): Promise<void> {
    try {
      await this.volumioClient?.mute();
      this.log.debug("Volume muted");
      this.setStateAsync("playbackInfo.mute", true, true);
      this.setStateAsync("player.muted", true, true);
    } catch (error) {
      this.log.error(`Error muting volume: ${error}`);
    }
  }

  private async volumeUnmute(): Promise<void> {
    try {
      await this.volumioClient?.unmute();
      this.log.debug("Volume unmuted");
      this.setStateAsync("playbackInfo.mute", false, true);
      this.setStateAsync("player.muted", false, true);
    } catch (error) {
      this.log.error(`Error unmuting volume: ${error}`);
    }
  }

  private async playbackPause(): Promise<void> {
    try {
      await this.volumioClient?.pause();
      this.log.debug("Playback paused");
      this.setStateAsync("playbackInfo.status", "pause", true);
    } catch (error) {
      this.log.error(`Error pausing playback: ${error}`);
    }
  }

  private async playbackPlay(n?: any): Promise<void> {
    if (n && !isNumber(n)) {
      this.log.warn("player.playN state change. Invalid state value passed");
      return;
    }
    try {
      await this.volumioClient?.play(n);
      this.log.debug("Playback started");
      this.setStateAsync("playbackInfo.status", "play", true);
    } catch (error) {
      this.log.error(`Error starting playback: ${error}`);
    }
  }

  private async playbackStop(): Promise<void> {
    try {
      await this.volumioClient?.stop();
      this.log.debug("Playback stopped");
      this.setStateAsync("playbackInfo.status", "stop", true);
    } catch (error) {
      this.log.error(`Error stopping playback: ${error}`);
    }
  }

  private async playbackToggle(): Promise<void> {
    try {
      await this.volumioClient?.toggle();
      this.log.debug("Playback toggled");
      this.getState("playbackInfo.status", (_err, state) => {
        if (state?.val === "play") {
          this.setStateAsync("playbackInfo.status", "pause", true);
        } else if (state?.val === "pause" || state?.val === "stop") {
          this.setStateAsync("playbackInfo.status", "play", true);
        }
      });
    } catch (error) {
      this.log.error(`Error toggling playback: ${error}`);
    }
  }

  private async volumeSetTo(value: any): Promise<void> {
    if (!isNumber(value)) {
      this.log.warn("player.volume state change. Invalid state value passed");
      return;
    }
    try {
      await this.volumioClient?.setVolume(value);
      this.log.debug(`Volume set to ${value}`);
      this.setStateAsync("playbackInfo.volume", value, true);
      this.setStateAsync("player.volume", value, true);
    } catch (error) {
      this.log.error(`Error setting volume: ${error}`);
    }
  }

  private async volumeUp(): Promise<void> {
    try {
      await this.volumioClient?.volumePlus();
      this.log.debug("Volume increased");
    } catch (error) {
      this.log.error(`Error increasing volume: ${error}`);
    }
  }

  private async volumeDown(): Promise<void> {
    try {
      await this.volumioClient?.volumeMinus();
      this.log.debug("Volume decreased");
    } catch (error) {
      this.log.error(`Error decreasing volume: ${error}`);
    }
  }

  private async setRandomPlayback(random: any): Promise<void> {
    if (typeof random !== "boolean") {
      this.log.warn("player.random state change. Invalid state value passed");
      return;
    }
    try {
      await this.volumioClient?.setRandom(random);
      this.log.debug(`Random play set to ${random}`);
      this.setStateAsync("playbackInfo.random", random, true);
      this.setStateAsync("queue.shuffleMode", random ? 1 : 0, true);
    } catch (error) {
      this.log.error(`Error setting random play: ${error}`);
    }
  }

  private async clearQueue(): Promise<void> {
    try {
      await this.volumioClient?.clearQueue();
      this.log.debug(`Queue cleared`);
    } catch (error) {
      this.log.error(`Error clearing queue: ${error}`);
    }
  }

  private async setRepeatTrack(repeat: any): Promise<void> {
    if (typeof repeat !== "boolean") {
      this.log.warn(
        "player.repeatTrackState state change. Invalid state value passed",
      );
      return;
    }
    try {
      await this.volumioClient?.setRepeatSingle(repeat);
      this.log.debug(`Repeat track set to ${repeat}`);
      this.setStateAsync("playbackInfo.repeatSingle", repeat, true);
      this.setStateAsync("queue.repeatSingle", repeat ? 1 : 0, true);
    } catch (error) {
      this.log.error(`Error setting repeat track: ${error}`);
    }
  }
}

function isNumber(value: any): boolean {
  return value != null && value !== "" && !isNaN(Number(value.toString()));
}

if (require.main !== module) {
  // Export the constructor in compact mode
  module.exports = (options: Partial<utils.AdapterOptions> | undefined) =>
    new Volumio(options);
} else {
  // otherwise start the instance directly
  (() => new Volumio())();
}
