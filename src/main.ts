/*
 * Created with @iobroker/create-adapter v1.31.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import { PlayerState } from './types';
import axios, { AxiosInstance } from 'axios';
import express from 'express';
import bodyParser from 'body-parser'
import ipInfo from 'ip';

// Load your modules here, e.g.:
// import * as fs from "fs";

class Volumio extends utils.Adapter {

    playerState: PlayerState;
    static readonly namespace = 'volumio.0.';
    axiosInstance: AxiosInstance;
    httpServer;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'volumio',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.axiosInstance = axios.create();
        this.playerState = {} as PlayerState;
        this.httpServer = express();
        this.httpServer.use(bodyParser.urlencoded({ extended: false }));
        this.httpServer.use(bodyParser.json());
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        // Initialize your adapter here

        // Subsribe to all state changes
        this.subscribeStates('*');

        this.axiosInstance = axios.create({
            baseURL: `http://${this.config.host}/api/v1/`,
            timeout: 1000
        });

        if (this.config.subscribeToStateChanges && this.config.subscriptionPort) {
            this.log.debug('Subscription mode is activated');
            this.httpServer.listen(this.config.subscriptionPort);
            this.log.debug(`Server is listening on ${ipInfo.address()}:${this.config.subscriptionPort}`);
            this.subscribeToVolumioNotifications();
        } else if (this.config.subscribeToStateChanges && !this.config.subscriptionPort) {
            this.log.error('Subscription mode is activated, but port is not configured.');
        } else if (!this.config.subscribeToStateChanges) {
            this.unsubscribeFromVolumioNotifications();
        }

        this.httpServer.post('/volumiostatus', (req, res) => {
            this.log.info(`body: `+req.body);
            res.sendStatus(200);
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
    private onUnload(callback: () => void): void {
        // unsu
        this.unsubscribeFromVolumioNotifications();
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);

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
        if (!id || !state) {
            return;
        }
        this.log.debug(`state ${id} changed: ${state.val}`);

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
                this.playerState.status = 'pause';
                this.setStateAsync('playbackInfo.status', 'pause', true);
                break;
            case 'player.play':
                this.sendCmd('play');
                this.playerState.status = 'play';
                this.setStateAsync('playbackInfo.status', 'play', true);
                break;
            case 'player.playN':
                if (!isNumber(state.val)) {
                    this.log.warn('player.playN state change. Invalid state value passed');
                    break;
                }
                this.sendCmd(`play&N=${state.val}`);
                this.playerState.status = 'play';
                break;
            case 'player.prev':
                this.sendCmd('prev');
                break;
            case 'player.stop':
                this.sendCmd('stop');
                this.playerState.status = 'stop';
                this.setStateAsync('playbackInfo.status', 'stop', true);
                break;
            case 'player.toggle':
                this.sendCmd('toggle');
                if (this.playerState.status == 'play') {
                    this.playerState.status = 'pause'
                } else if (this.playerState.status == 'pause' || this.playerState.status == 'stop') {
                    this.playerState.status = 'play'
                }
                break;
            case 'player.volume':
                if (!isNumber(state.val)) {
                    this.log.warn('player.volume state change. Invalid state value passed');
                    break;
                } else if ((!state.val && state.val !== 0) || state.val > 100 || state.val < 0) {
                    this.log.warn('player.volume state change. Invalid state value passed');
                    break;
                }
                this.sendCmd(`volume&volume=${state.val}`);
                this.playerState.volume = state.val as number;
                this.setStateAsync('playbackInfo.volume', state.val as number, true);
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
            case 'playbackInfo.random':
            case 'queue.random':
                if (typeof state?.val !== 'boolean') {
                    this.log.warn('player.random state change. Invalid state value passed');
                    break;
                }
                this.sendCmd(`random&value=${state.val}`);
                this.playerState.random = state.val;
                this.setStateAsync('queue.shuffleMode', (state.val ? 1 : 0), true);
                break;
            case 'queue.shuffleMode':
                if (!isNumber(state.val)) {
                    this.log.warn('queue.shuffleMode state change. Invalid state value passed');
                    break;
                }
                if (state.val === 0) {
                    this.sendCmd('random&value=false');
                    this.sendCmd('repeat&value=false');
                    this.playerState.random = false;
                    this.playerState.repeat = false;
                    this.playerState.repeatSingle = false;
                    this.setStateAsync('queue.random', false, true);
                    this.setStateAsync('queue.repeatTrackState', false, true);
                    this.setStateAsync('playbackInfo.random', false, true);
                    this.setStateAsync('playbackInfo.repeat', false, true);
                    this.setStateAsync('playbackInfo.repeatSingle', false, true);
                } else if (state.val === 1) {
                    this.sendCmd('random&value=true');
                    this.playerState.random = true;
                    this.setStateAsync('queue.random', true, true);
                } else if (state.val === 2) {
                    this.log.warn('queue.shuffleMode 2 not implemented yet');
                } else {
                    throw new Error('Invalid value passed');
                }
                break;
            case 'queue.repeatTrackState':
                if (typeof state?.val !== 'boolean') {
                    this.log.warn('player.repeatTrackState state change. Invalid state value passed');
                    break;
                }
                this.sendCmd(`repeat&value=${state.val}`);
                this.playerState.repeat = state.val;
                break;
        }
    }

    sendCmd<T>(cmd: string): Promise<T> {
        return this.apiGet<T>(`commands/?cmd=${cmd}`);
    }

    async apiGet<T>(url: string): Promise<T> {
        return await this.axiosInstance.get(url).then(res => {
            if (!res.status) {
                throw new Error(`Error during GET on ${url}: ${res.statusText}`)
            }
            return res.data;
        });
    }

    async apiPost<T>(url: string, data?: any): Promise<T> {
        return await this.axiosInstance.post(url, data).then(res => {
            if (!res.status) {
                throw new Error(`Error during POST on ${url}: ${res.statusText}`)
            }
            return res.data;
        });
    }

    async apiDelete<T>(url: string, data?: any): Promise<T> {
        return await this.axiosInstance.post(url, data).then(res => {
            if (!res.status) {
                throw new Error(`Error during DELETE on ${url}: ${res.statusText}`)
            }
            return res.data;
        });
    }

    updatePlayerState(): void {
        this.apiGet<PlayerState>('getState').then(p => {
            this.playerState = p;
            this.propagatePlayserStateIntoStates(this.playerState);
        });
    }

    propagatePlayserStateIntoStates(playerState: PlayerState): void {
        this.setStateAsync('playbackInfo.album', playerState.album);
        this.setStateAsync('playbackInfo.albumart', playerState.albumart);
        this.setStateAsync('playbackInfo.artist', playerState.artist);
        this.setStateAsync('playbackInfo.bitdepth', playerState.bitdepth);
        this.setStateAsync('playbackInfo.channels', playerState.channels);
        this.setStateAsync('playbackInfo.consume', playerState.consume);
        this.setStateAsync('playbackInfo.disableVolumeControl', playerState.disableVolumeControl);
        this.setStateAsync('playbackInfo.duration', playerState.duration);
        this.setStateAsync('player.muted', playerState.mute);
        this.setStateAsync('playbackInfo.mute', playerState.mute);
        this.setStateAsync('playbackInfo.position', playerState.position);
        this.setStateAsync('playbackInfo.random', playerState.random);
        this.setStateAsync('playbackInfo.repeat', playerState.repeat);
        this.setStateAsync('playbackInfo.repeatSingle', playerState.repeatSingle);
        this.setStateAsync('queue.repeatTrackState', playerState.repeatSingle);
        this.setStateAsync('playbackInfo.samplerate', playerState.samplerate);
        this.setStateAsync('playbackInfo.seek', playerState.seek);
        this.setStateAsync('playbackInfo.service', playerState.service);
        this.setStateAsync('playbackInfo.status', playerState.status);
        this.setStateAsync('playbackInfo.stream', playerState.stream);
        this.setStateAsync('playbackInfo.title', playerState.title);
        this.setStateAsync('playbackInfo.title', playerState.title);
        this.setStateAsync('playbackInfo.title', playerState.title);
        this.setStateAsync('playbackInfo.trackType', playerState.trackType);
        this.setStateAsync('playbackInfo.updatedb', playerState.updatedb);
        this.setStateAsync('playbackInfo.uri', playerState.uri);
        this.setStateAsync('playbackInfo.title', playerState.title);
        this.setStateAsync('playbackInfo.volatile', playerState.volatile);
        this.setStateAsync('playbackInfo.volume', playerState.volume);
        this.setStateAsync('player.volume', playerState.volume);
    }

    async subscribeToVolumioNotifications(): Promise<void> {
        // check if already subscribed
        const urls = await this.apiGet<string>('pushNotificationUrls');
        this.log.info(urls);
        if (urls.includes(`${ipInfo.address()}:${this.config.subscriptionPort}`)) {
            this.log.debug('Already subscribed to volumio push notifications');
            return;
        }
        // enter local http server as notification url
        const data = {'url':`http://${ipInfo.address()}:${this.config.subscriptionPort}/volumiostatus`};
        const res = await this.apiPost('pushNotificationUrls',data) as any;
        if (!res || !res.success || res.success !== true) {
            this.log.error(`Binding subscription url failed: ${res.error ? res.error : 'Unknown error'}`);
        }
    }

    async unsubscribeFromVolumioNotifications(): Promise<void> {
        // check if was subscribed
        const urls = await this.apiGet<string>('pushNotificationUrls');
        if (!urls.includes(`${ipInfo.address()}:${this.config.subscriptionPort}`)) {
            this.log.debug('Subscription was not active. No need to unsubscribe');
            return;
        }
        // remove local http server from notification urls
        const data = {'url':`http://${ipInfo.address()}:${this.config.subscriptionPort}/volumiostatus`};
        const res = await this.apiDelete('pushNotificationUrls',data) as any;
        if (!res || !res.success || res.success !== true) {
            this.log.error(`Removing subscription url failed: ${res.error ? res.error : 'Unknown error'}`);
        }
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

function isNumber(value: any): boolean {
    return ((value != null) &&
        (value !== '') &&
        !isNaN(Number(value.toString())));
}


if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Volumio(options);
} else {
    // otherwise start the instance directly
    (() => new Volumio())();
}