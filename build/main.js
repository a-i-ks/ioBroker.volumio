"use strict";
/*
 * Created with @iobroker/create-adapter v1.31.0
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
const axios_1 = __importDefault(require("axios"));
// Load your modules here, e.g.:
// import * as fs from "fs";
class Volumio extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'volumio',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.playerState = undefined;
        this.axiosInstance = axios_1.default.create();
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        // Subsribe to all state changes
        this.subscribeStates('*');
        this.axiosInstance = axios_1.default.create({
            baseURL: `http://${this.config.host}/api/v1/`,
            timeout: 1000
            // headers: {'X-Custom-Header': 'foobar'}
        });
        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        //this.log.info('config option1: ' + this.config.option1);
        //this.log.info('config option2: ' + this.config.option2);
        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
        // await this.setObjectNotExistsAsync('testVariable', {
        //     type: 'state',
        //     common: {
        //         name: 'testVariable',
        //         type: 'boolean',
        //         role: 'indicator',
        //         read: true,
        //         write: true,
        //     },
        //     native: {},
        // });
        // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
        //this.subscribeStates('testVariable');
        // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
        // this.subscribeStates('lights.*');
        // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
        // this.subscribeStates('*');
        /*
            setState examples
            you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
        */
        // the variable testVariable is set to true as command (ack=false)
        //await this.setStateAsync('testVariable', true);
        // same thing, but the value is flagged "ack"
        // ack should be always set to true if the value is received from or acknowledged from the target system
        //await this.setStateAsync('testVariable', { val: true, ack: true });
        // same thing, but the state is deleted after 30s (getState will return null afterwards)
        //await this.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });
        // examples for the checkPassword/checkGroup functions
        //let result = await this.checkPasswordAsync('admin', 'iobroker');
        //this.log.info('check user admin pw iobroker: ' + result);
        //result = await this.checkGroupAsync('admin', 'admin');
        //this.log.info('check group user admin group admin: ' + result);
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);
            callback();
        }
        catch (e) {
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
        this.log.info(`onStateChange`);
        if (!id || !state) {
            return;
        }
        this.log.info(`state ${id} changed: ${state.val}`);
        switch (id.replace(`${this.namespace}.`, ``)) {
            case 'getPlaybackInfo':
                this.updatePlayerState();
                break;
            case 'player.mute':
                this.sendCmd('volume&mute');
                break;
            case 'player.unmute':
                this.sendCmd('volume&unmute');
                break;
            case 'player.next':
                this.sendCmd('next');
                break;
            case 'player.pause':
                this.sendCmd('pause');
                break;
            case 'player.play':
                this.sendCmd('play');
                break;
            case 'player.playN':
                if (!isNumber(state.val)) {
                    break;
                }
                this.sendCmd(`play&N=${state.val}`);
                break;
            case 'player.prev':
                this.sendCmd('prev');
                break;
            case 'player.stop':
                this.sendCmd('stop');
                break;
            case 'player.toggle':
                this.sendCmd('toggle');
                break;
            case 'player.volume':
                if (!isNumber(state.val)) {
                    break;
                }
                else if (!state.val || state.val > 100 || state.val < 0) {
                    break;
                }
                this.sendCmd(`volume&volume=${state.val}`);
                break;
            case 'player.volume.down':
                this.sendCmd('volume&minus');
                break;
            case 'player.volume.up':
                this.sendCmd('volume&plus');
                break;
            case 'queue.clearQueue':
                this.sendCmd('clearQueue');
                break;
            case 'queue.repeatTrack':
                this.sendCmd('repeat');
                break;
            case 'queue.repeatTrackState':
                if (!state.val || typeof state.val !== 'boolean') {
                    break;
                }
                this.sendCmd(`repeat&value=${state.val}`);
                break;
        }
    }
    async sendCmd(cmd) {
        return this.apiGet(`?cmd=${cmd}`);
    }
    async apiGet(url) {
        return await this.axiosInstance.get(url).then(res => {
            if (!res.status) {
                throw new Error(res.statusText);
            }
            return res.data;
        });
    }
    async updatePlayerState() {
        this.playerState = await this.apiGet('getState');
        this.propagatePlayserStateIntoStates(this.playerState);
        // Object.keys(this.playerState).forEach(key =>
        //     {
        //         console.log(`key=${key}  value=${this.playerState[key]}`);
        //     }
    }
    async propagatePlayserStateIntoStates(playerState) {
        await this.setStateAsync('playbackInfo.album', playerState.album);
        await this.setStateAsync('playbackInfo.albumart', playerState.albumart);
        await this.setStateAsync('playbackInfo.artist', playerState.artist);
        await this.setStateAsync('playbackInfo.bitdepth', playerState.bitdepth);
        await this.setStateAsync('playbackInfo.channels', playerState.channels);
        await this.setStateAsync('playbackInfo.consume', playerState.consume);
        await this.setStateAsync('playbackInfo.disableVolumeControl', playerState.disableVolumeControl);
        await this.setStateAsync('playbackInfo.duration', playerState.duration);
        await this.setStateAsync('playbackInfo.mute', playerState.mute);
        await this.setStateAsync('playbackInfo.position', playerState.position);
        await this.setStateAsync('playbackInfo.random', playerState.random);
        await this.setStateAsync('playbackInfo.repeat', playerState.repeat);
        await this.setStateAsync('playbackInfo.repeatSingle', playerState.repeatSingle);
        await this.setStateAsync('playbackInfo.samplerate', playerState.samplerate);
        await this.setStateAsync('playbackInfo.seek', playerState.seek);
        await this.setStateAsync('playbackInfo.service', playerState.service);
        await this.setStateAsync('playbackInfo.status', playerState.status);
        await this.setStateAsync('playbackInfo.stream', playerState.stream);
        await this.setStateAsync('playbackInfo.title', playerState.title);
        await this.setStateAsync('playbackInfo.title', playerState.title);
        await this.setStateAsync('playbackInfo.title', playerState.title);
        await this.setStateAsync('playbackInfo.trackType', playerState.trackType);
        await this.setStateAsync('playbackInfo.updatedb', playerState.updatedb);
        await this.setStateAsync('playbackInfo.uri', playerState.uri);
        await this.setStateAsync('playbackInfo.title', playerState.title);
        await this.setStateAsync('playbackInfo.volatile', playerState.volatile);
        await this.setStateAsync('playbackInfo.volume', playerState.volume);
    }
}
Volumio.namespace = 'volumio.0.';
function isNumber(value) {
    return ((value != null) &&
        (value !== '') &&
        !isNaN(Number(value.toString())));
}
if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options) => new Volumio(options);
}
else {
    // otherwise start the instance directly
    (() => new Volumio())();
}
//# sourceMappingURL=main.js.map