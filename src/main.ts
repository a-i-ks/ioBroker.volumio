/*
 * Created with @iobroker/create-adapter v2.6.3
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";
import axios, { AxiosInstance } from "axios";
import express from "express";
import bodyParser from "body-parser";
import ipInfo from "ip";
import e from "express";

// Load your modules here, e.g.:
// import * as fs from "fs";

class Volumio extends utils.Adapter {

    private axiosInstance: AxiosInstance | null = null;
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
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        // Initialize your adapter here

        // Setup axios instance
        this.axiosInstance = axios.create(
            {
                baseURL: `http://${this.config.host}/api/v1/`,
                timeout: 1000,
            }
        );


        // Reset the connection indicator during startup
        this.setState("info.connection", false, true);

        // Subscribe to all state changes in the 'volumio' namespace
        this.subscribeStates("*");

        // Try to ping the Volumio host
        const connectionSuccess = await this.pingVolumio();

        // Setup connection check interval
        if (this.config.checkConnection) {
            let interval = this.config.checkConnectionInterval;
            if (!interval || !isNumber(interval)) {
                this.log.error(`Invalid connection check interval setting. Will be set to 30s`);
                interval = 30;
            }
            this.checkConnectionInterval = setInterval(this.checkConnection, interval*1000, this);
        }

        // get system infos
        if (connectionSuccess) {
            this.getSystemInfo();
            // get inital player state
            this.getPlayerState();
        }

        // setup subscription mode if enabled
        if (this.config.subscribeToStateChanges && this.config.subscriptionPort && connectionSuccess) {
            this.log.debug(`Starting server on ${this.config.subscriptionPort} for subscription mode ...`);
            try {
                this.httpServerInstance = this.httpServer.listen(this.config.subscriptionPort)
                    .on("error", (error: any) => {
                        if (error.code === "EADDRINUSE") {
                            this.log.error(`Port ${this.config.subscriptionPort} is already in use. Please choose another one. Subscription mode will not be available.`);
                            this.config.subscribeToStateChanges = false;
                        } else {
                            this.log.error(`Starting server on ${this.config.subscriptionPort} for subscription mode failed: ${error}`);
                        }
                    });
                this.log.debug(`Server is listening on ${ipInfo.address()}:${this.config.subscriptionPort}`);
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
            this.onVolumioStateChange(req.body)
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
     */
    private onUnload(callback: () => void): void {
        try {
            this.unsubscribeFromVolumioNotifications();
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);

            if (this.checkConnectionInterval) {
                clearInterval(this.checkConnectionInterval);
                this.checkConnectionInterval = null;
            }

            // terminate express http server
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
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (!state) {
            this.log.info(`state ${id} deleted`);
            return;
        }

        if (state.ack) {
            this.log.silly(`State change of ${id} to "${state.val}" was already acknowledged. No need for further actions`);
            return;
        }
        this.log.debug(`state ${id} changed to ${state?.val}`);
        const stateId = id.replace(new RegExp(`^volumio.\\d+\\.`), "");
        switch (stateId) {
            case "getPlaybackInfo":
                this.getPlayerState();
                break;
            case "player.mute":
                this.volumeMute()
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
                this.playbackPlay(state.val)
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
                this.getStateAsync("playbackInfo.repeatSingle", (err: any, state: { val: any; }) => {
                    if (state) {
                        this.setRepeatTrack(!state.val);
                    }});
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

    private onVolumioStateChange(msg: any): void {
        this.log.debug(`State change message received: ${JSON.stringify(msg)}`);
        if (!msg || !msg.item) {
            this.log.warn(`Unprocessable state change message received: ${JSON.stringify(msg)}`);
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
        const urls = JSON.stringify(
            await this.axiosInstance?.get("pushNotificationUrls").then(response => {
                return response.data;
            }).catch(err => {
                this.setStateAsync("info.connection", false, true);
                throw new Error(`Error receiving pushNotificationUrls: ${err.message}`);
            })
        );
        this.setStateAsync("info.connection", true, true);
        if (urls.includes(`${ipInfo.address()}:${this.config.subscriptionPort}`)) {
            this.log.debug("Already subscribed to volumio push notifications");
            return;
        }
        // enter local http server as notification url
        const data = { "url": `http://${ipInfo.address()}:${this.config.subscriptionPort}/volumiostatus` };
        this.axiosInstance?.post("pushNotificationUrls", data).then(response => {
            if (response.data?.success) {
                this.log.debug("Subscription to volumio push notifications successful");
            } else {
                this.log.error(`Subscription to volumio push notifications failed: ${response.data}`);
            }
        }).catch(err => {
            this.log.error(`Subscription to volumio push notifications failed: ${err.message}`);
            this.setStateAsync("info.connection", false, true);
        });
    }

    private async unsubscribeFromVolumioNotifications(): Promise<void> {
        this.log.debug("Unsubscribing from volumio push notifications ...");
        // check if was subscribed
        const urls = JSON.stringify(
            await this.axiosInstance?.get("pushNotificationUrls").then(response => {
                return response.data;
            }).catch(err => {
                this.setStateAsync("info.connection", false, true);
                throw new Error(`Error receiving pushNotificationUrls: ${err.message}`);
            })
        );
        if (!urls.includes(`${ipInfo.address()}:${this.config.subscriptionPort}`)) {
            this.log.debug("Subscription was not active. No need to unsubscribe")
            return
        }
        // remove local http server from notification urls
        const data = { "url": `http://${ipInfo.address()}:${this.config.subscriptionPort}/volumiostatus` };
        this.axiosInstance?.delete("pushNotificationUrls", data).then(response => {
            if (response.data?.success) {
                this.log.debug("Unsubscription from volumio push notifications successful");
            } else {
                this.log.error(`Unsubscription from volumio push notifications failed: ${response.data}`);
            }
        }).catch(err => {
            this.log.error(`Unsubscription from volumio push notifications failed: ${err.message}`);
            this.setStateAsync("info.connection", false, true);
        });
    }

    async pingVolumio(): Promise<boolean> {
        this.log.debug("Pinging volumio ...");
        try {
            this.log.debug("Volumio ping success");
            const response = await this.axiosInstance?.get("ping");
            this.setState("info.connection", true, true);
            if (response?.data !== "pong") {
                this.log.warn(`Volumio API did not respond correctly to ping. Please report this issue to the developer!`);
            }
            return true;
        } catch (error) {
            this.log.error(`Connection to Volumio host (${this.config.host}) failed: ${error}`);
            this.setState("info.connection", false, true);
            return false;
        }
    }

    private checkConnection(context: any) : void {
        context.log.debug("Checking connection to Volumio ...");
        if (context.config.subscribeToStateChanges) {
            context.subscribeToVolumioNotifications();
        } else {
            context.pingVolumio();
        }
    }

    private getSystemInfo(): void {
        this.axiosInstance?.get("getSystemInfo").then(response => {
            this.log.debug(`getSystemInfo response: ${JSON.stringify(response?.data)}`);
            if (response.data) {
                this.updateSystemInfo(response.data);
            }
            if (response.data?.state) {
                this.updatePlayerState(response.data.state);
            }

        }).catch(error => {
            this.log.error(`Error getting system info: ${error}`);
        });
    }

    private getPlayerState(): void {
        this.axiosInstance?.get("getState").then(response => {
            this.log.debug(`getState response: ${JSON.stringify(response?.data)}`);
            if (response.data) {
                this.updatePlayerState(response.data);
            }
        }).catch(error => {
            this.log.error(`Error getting player state: ${error}`);
        });
    }

    private updatePlayerState(state: any) : void {
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
        }
        else if (state.title) {
            this.setStateAsync("playbackInfo.title", state.title, true);
        }
        else if (state.track) {
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

    private updateSystemInfo(systemInfo: any) : void {
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

    private nextTrack(): void {
        this.axiosInstance?.get("commands/?cmd=next").then(response => {
            if (response.data?.response?.toLowerCase().includes("success")) {
                this.log.debug("Next track");
            } else {
                this.log.warn(`Next track failed: ${response.data}`);
            }
        }).catch(error => {
            this.log.error(`Error playing next track: ${error}`);
        });
    }

    private previousTrack(): void {
        this.axiosInstance?.get("commands/?cmd=prev").then(response => {
            if (response.data?.response?.toLowerCase().includes("success")) {
                this.log.debug("Previous track");
            } else {
                this.log.warn(`Previous track failed: ${response.data}`);
            }
        }).catch(error => {
            this.log.error(`Error playing previous track: ${error}`);
        });
    }

    private volumeMute(): void {
        this.axiosInstance?.get("commands/?cmd=volume&volume=mute").then(response => {
            if (response.data?.response?.toLowerCase().includes("success")) {
                this.log.debug("Volume muted");
                this.setStateAsync("playbackInfo.mute", true, true);
                this.setStateAsync("player.mute", true, true);
            } else {
                this.log.warn(`Volume muting failed: ${response.data}`);
            }
        }).catch(error => {
            this.log.error(`Error muting volume: ${error}`);
        });
    }

    private volumeUnmute(): void {
        this.axiosInstance?.get("commands/?cmd=volume&volume=unmute").then(response => {
            if (response.data?.response?.toLowerCase().includes("success")) {
                this.log.debug("Volume unmuted");
                this.setStateAsync("playbackInfo.mute", false, true);
                this.setStateAsync("player.mute", false, true);
            } else {
                this.log.warn(`Volume unmuting failed: ${response.data}`);
            }
        }).catch(error => {
            this.log.error(`Error unmuting volume: ${error}`);
        });
    }

    private playbackPause(): void {
        this.axiosInstance?.get("commands/?cmd=pause").then(response => {
            if (response.data?.response?.toLowerCase().includes("success")) {
                this.log.debug("Playback paused");
                this.setStateAsync("playbackInfo.status", "pause", true);
            } else {
                this.log.warn(`Playback pausing failed: ${response.data}`);
            }
        }).catch(error => {
            this.log.error(`Error pausing playback: ${error}`);
        });
    }

    private playbackPlay(n? : any): void {
        if (n && !isNumber(n)) {
            this.log.warn("player.playN state change. Invalid state value passed");
            return;
        }
        const cmdTxt = `play${n ? (`&N=${n}`) : ``}`;
        this.axiosInstance?.get(`commands/?cmd=${cmdTxt}`).then(response => {
            if (response.data?.response?.toLowerCase().includes("success")) {
                this.log.debug("Playback started");
                this.setStateAsync("playbackInfo.status", "play", true);
            } else {
                this.log.warn(`Playback starting failed: ${response.data}`);
            }
        }).catch(error => {
            this.log.error(`Error starting playback: ${error}`);
        });
    }

    private playbackStop(): void {
        this.axiosInstance?.get("commands/?cmd=stop").then(response => {
            if (response.data?.response?.toLowerCase().includes("success")) {
                this.log.debug("Playback stopped");
                this.setStateAsync("playbackInfo.status", "stop", true);
            } else {
                this.log.warn(`Playback stopping failed: ${response.data}`);
            }
        }).catch(error => {
            this.log.error(`Error stopping playback: ${error}`);
        });
    }

    private playbackToggle(): void {
        this.axiosInstance?.get("commands/?cmd=toggle").then(response => {
            if (response.data?.response?.toLowerCase().includes("success")) {
                this.log.debug("Playback toggled");
                this.getState("playbackInfo.status", (err, state) => {
                    if (state?.val === "play") {
                        this.setStateAsync("playbackInfo.status", "pause", true);
                    } else if (state?.val === "pause" || state?.val === "stop") {
                        this.setStateAsync("playbackInfo.status", "play", true);
                    }
                });
            } else {
                this.log.warn(`Playback toggling failed: ${response.data}`);
            }
        }).catch(error => {
            this.log.error(`Error toggling playback: ${error}`);
        });
    }

    private volumeSetTo(value: any): void {
        if (!isNumber(value)) {
            this.log.warn("player.volume state change. Invalid state value passed");
            return;
        }
        this.axiosInstance?.get(`commands/?cmd=volume&volume=${value}`).then(response => {
            if (response.data?.response?.toLowerCase().includes("success")) {
                this.log.debug(`Volume set to ${value}`);
                this.setStateAsync("playbackInfo.volume", value, true);
                this.setStateAsync("player.volume", value);
            } else {
                this.log.warn(`Volume setting failed: ${response.data}`);
            }
        }).catch(error => {
            this.log.error(`Error setting volume: ${error}`);
        });
    }

    private volumeUp(): void {
        let volumeSteps = this.config.volumeSteps;
        if (!volumeSteps || volumeSteps > 100 || volumeSteps < 0) {
            this.log.warn(`Invalid volume step setting. volumeSteps will be set to 10`);
            volumeSteps = 10;
        }
        let currentVolume : number = 0;
        this.getState("playbackInfo.volume", (err, state) => {
            if (state) {
                currentVolume = state.val as number;
            } else {
                this.log.warn("Volume state not found. Setting volume to 0");
                currentVolume =  0;
            }});
        const newVolumeValue = ((currentVolume + volumeSteps) > 100) ? 100 : currentVolume + volumeSteps;
        this.volumeSetTo(newVolumeValue);
    }

    private volumeDown(): void {
        let volumeSteps = this.config.volumeSteps;
        if (!volumeSteps || volumeSteps > 100 || volumeSteps < 0) {
            this.log.warn(`Invalid volume step setting. volumeSteps will be set to 10`);
            volumeSteps = 10;
        }
        let currentVolume : number = 0;
        this.getState("playbackInfo.volume", (err, state) => {
            if (state) {
                currentVolume = state.val as number;
            } else {
                this.log.warn("Volume state not found. Setting volume to 0");
                currentVolume =  0;
            }});
        const newVolumeValue = ((currentVolume - volumeSteps) < 0) ? 0 : currentVolume - volumeSteps;
        this.volumeSetTo(newVolumeValue);
    }

    private setRandomPlayback(random: any): void {
        if (typeof random !== "boolean") {
            this.log.warn("player.random state change. Invalid state value passed");
            return;
        }
        this.axiosInstance?.get(`commands/?cmd=random&value=${random}`).then(response => {
            if (response.data?.response?.toLowerCase().includes("success")) {
                this.log.debug(`Random play set to ${random}`);
                this.setStateAsync("playbackInfo.random", random, true);
                this.setStateAsync("queue.shuffleMode", (random ? 1 : 0), true);

            } else {
                this.log.warn(`Random play setting failed: ${response.data}`);
            }
        }).catch(error => {
            this.log.error(`Error setting random play: ${error}`);
        });
    }

    private clearQueue(): void {
        this.axiosInstance?.get(`commands/?cmd=clearQueue`).then(response => {
            if (response.data?.response?.toLowerCase().includes("success")) {
                this.log.debug(`Queue cleared`);
            } else {
                this.log.warn(`Queue clearing failed: ${response.data}`);
            }
        }).catch(error => {
            this.log.error(`Error clearing queue: ${error}`);
        });
    }

    private setRepeatTrack(repeat: any): void {
        if (typeof repeat !== "boolean") {
            this.log.warn("player.repeatTrackState state change. Invalid state value passed");
            return;
        }
        this.axiosInstance?.get(`commands/?cmd=repeat&value=${repeat}`).then(response => {
            if (response.data?.response?.toLowerCase().includes("success")) {
                this.log.debug(`Repeat track set to ${repeat}`);
                this.setStateAsync("playbackInfo.repeatSingle", repeat, true);
                this.setStateAsync("queue.repeatSingle", (repeat ? 1 : 0), true);
            } else {
                this.log.warn(`Repeat track setting failed: ${response.data}`);
            }
        }).catch(error => {
            this.log.error(`Error setting repeat track: ${error}`);
        });
    }
}

function isNumber(value: any): boolean {
    return ((value != null) &&
        (value !== "") &&
        !isNaN(Number(value.toString())));
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Volumio(options);
} else {
    // otherwise start the instance directly
    (() => new Volumio())();
}