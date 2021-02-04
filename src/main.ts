/*
 * Created with @iobroker/create-adapter v1.31.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import { PlayerState, StateChangeMsg, VolumioSystemInfo, ApiResonse } from './types';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import express from 'express';
import bodyParser from 'body-parser';
import ipInfo from 'ip';

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

        // try to ping volumio
        let connectionSuccess = false;
        try {
            const pingResp = await this.apiGet<string>('ping');
            connectionSuccess = true;
            this.setStateAsync('info.connection', true, true);
            if (pingResp !== 'pong') {
                this.log.warn(`Volumio API did not respond correctly to ping. Please report this issue to the developer!`);
            }
        } catch (error) {
            this.log.error(`Connection to Volumio host ${this.config.host} failed: ${error.message}`);
            this.setStateAsync('info.connection', false, true);
        }

        // get system infos
        if(connectionSuccess) {
            this.apiGet<VolumioSystemInfo>('getSystemInfo').then(sysInfo => {
                this.setStateAsync('info.id', sysInfo.id, true);
                this.setStateAsync('info.host', sysInfo.host, true);
                this.setStateAsync('info.name', sysInfo.name, true);
                this.setStateAsync('info.type', sysInfo.type, true);
                this.setStateAsync('info.serviceName', sysInfo.serviceName, true);
                this.setStateAsync('info.systemversion', sysInfo.systemversion, true);
                this.setStateAsync('info.builddate', sysInfo.builddate, true);
                this.setStateAsync('info.variant', sysInfo.variant, true);
                this.setStateAsync('info.hardware', sysInfo.hardware, true);
            });
        }

        // get inital player state
        this.updatePlayerState();

        if (this.config.subscribeToStateChanges && this.config.subscriptionPort && connectionSuccess) {
            this.log.debug('Subscription mode is activated');
            try {
                this.httpServer.listen(this.config.subscriptionPort);
                this.log.debug(`Server is listening on ${ipInfo.address()}:${this.config.subscriptionPort}`);
                this.subscribeToVolumioNotifications();
            } catch (error) {
                this.log.error(`Starting server on ${this.config.subscriptionPort} for subscription mode  failed: ${error.message}`);
            }
        } else if (this.config.subscribeToStateChanges && !this.config.subscriptionPort) {
            this.log.error('Subscription mode is activated, but port is not configured.');
        } else if (!this.config.subscribeToStateChanges && connectionSuccess) {
            this.unsubscribeFromVolumioNotifications();
        }

        this.httpServer.post('/volumiostatus', (req, res) => {
            this.onVolumioStateChange(req.body)
            res.sendStatus(200);
        });
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

            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     */
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (!id || !state) {
            return;
        }
        if (state.ack) {
            this.log.debug(`State change of ${id} to "${state.val}" was already acknowledged. No need for further actions`);
            return;
        }

        switch (id.replace(`${this.namespace}.`, ``)) {
            case 'getPlaybackInfo':
                this.updatePlayerState();
                break;
            case 'player.mute':
                this.volumeMute()
                break;
            case 'player.unmute':
                this.volumeUnmute();
                break;
            case 'player.next':
                this.sendCmd('next');
                break;
            case 'player.prev':
                this.sendCmd('prev');
                break;
            case 'player.pause':
                this.playbackPause();
                break;
            case 'player.play':
                this.playbackPlay();
                break;
            case 'player.playN':
                this.playbackPlay(state.val)
                break;
            case 'player.stop':
                this.playbackStop();
                break;
            case 'player.toggle':
                this.playbackToggle();
                break;
            case 'playbackInfo.volume':
            case 'player.volume':
                this.volumeSetTo(state.val);
                break;
            case 'player.volume.down':
                this.volumeDown();
                break;
            case 'player.volume.up':
                this.volumeUp();
                break;
            case 'queue.clearQueue':
                this.sendCmd('clearQueue');
                break;
            case 'queue.repeatTrack':
                this.sendCmd('repeat');
                break;
            case 'playbackInfo.random':
            case 'queue.random':
                this.setRandomPlayback(state.val);
                break;
            case 'queue.shuffleMode':
                if (!isNumber(state.val)) {
                    this.log.warn('queue.shuffleMode state change. Invalid state value passed');
                    break;
                }
                if (state.val === 0) {
                    this.setRandomPlayback(false);
                } else if (state.val === 1) {
                    this.setRandomPlayback(true);
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

    sendCmd<ResT>(cmd: string): Promise<ResT> {
        return this.apiGet<ResT>(`commands/?cmd=${cmd}`);
    }

    async apiGet<ResT>(url: string): Promise<ResT> {
        return this.axiosInstance.get<any, AxiosResponse<ResT>>(url).then(res => {
            if (!res.status) {
                throw new Error(`Error during GET on ${url}: ${res.statusText}`);
            } else if (res.status !== 200) {
                throw new Error(`GET on ${url} returned ${res.status}: ${res.statusText}`)
            }
            return res.data as ResT;
        });
    }

    async apiPost<ReqT,ResT>(url: string, data?: any): Promise<ResT> {
        return await this.axiosInstance.post<ReqT, AxiosResponse<ResT>>(url, data).then(res => {
            if (!res.status) {
                throw new Error(`Error during POST on ${url}: ${res.statusText}`);
            }
            return res.data as ResT;
        });
    }

    async apiDelete<ReqT,ResT>(url: string, reqData?: any): Promise<ResT> {
        return await this.axiosInstance.delete<ReqT, AxiosResponse<ResT>>(url, {data: reqData}).then(res => {
            if (!res.status) {
                throw new Error(`Error during DELETE on ${url}: ${res.statusText}`);
            }
            return res.data as ResT;
        });
    }

    updatePlayerState(): void {
        this.apiGet<PlayerState>('getState').then(p => {
            this.playerState = p;
            this.propagatePlayserStateIntoStates(this.playerState);
        });
    }

    propagatePlayserStateIntoStates(playerState: PlayerState): void {
        this.setStateAsync('playbackInfo.album', playerState.album, true);
        this.setStateAsync('playbackInfo.albumart', playerState.albumart, true);
        this.setStateAsync('playbackInfo.artist', playerState.artist, true);
        this.setStateAsync('playbackInfo.bitdepth', playerState.bitdepth, true);
        this.setStateAsync('playbackInfo.channels', playerState.channels, true);
        this.setStateAsync('playbackInfo.consume', playerState.consume, true);
        this.setStateAsync('playbackInfo.disableVolumeControl', playerState.disableVolumeControl, true);
        this.setStateAsync('playbackInfo.duration', playerState.duration, true);
        this.setStateAsync('player.muted', playerState.mute, true);
        this.setStateAsync('playbackInfo.mute', playerState.mute, true);
        this.setStateAsync('playbackInfo.position', playerState.position, true);
        this.setStateAsync('playbackInfo.random', playerState.random, true);
        this.setStateAsync('playbackInfo.repeat', playerState.repeat, true);
        this.setStateAsync('playbackInfo.repeatSingle', playerState.repeatSingle, true);
        this.setStateAsync('queue.repeatTrackState', playerState.repeatSingle, true);
        this.setStateAsync('playbackInfo.samplerate', playerState.samplerate, true);
        this.setStateAsync('playbackInfo.seek', playerState.seek, true);
        this.setStateAsync('playbackInfo.service', playerState.service, true);
        this.setStateAsync('playbackInfo.status', playerState.status, true);
        this.setStateAsync('playbackInfo.stream', playerState.stream, true);
        this.setStateAsync('playbackInfo.title', playerState.title, true);
        this.setStateAsync('playbackInfo.trackType', playerState.trackType, true);
        this.setStateAsync('playbackInfo.updatedb', playerState.updatedb, true);
        this.setStateAsync('playbackInfo.uri', playerState.uri, true);
        this.setStateAsync('playbackInfo.volatile', playerState.volatile, true);
        this.setStateAsync('playbackInfo.volume', playerState.volume, true);
        this.setStateAsync('player.volume', playerState.volume, true);
    }

    volumeMute(): void {
        this.sendCmd<ApiResonse>('volume&volume=mute').then( r => {
            if (r.response === 'volume Success') {
                this.playerState.mute = true;
                this.setStateAsync('player.muted', this.playerState.mute);
                this.setStateAsync('playbackInfo.mute', this.playerState.mute);
            } else {
                this.log.warn(`Playpack mute was not successful: ${r.response}`);
            }
        });
    }

    volumeUnmute(): void {
        this.sendCmd<ApiResonse>('volume&volume=unmute').then( r => {
            if (r.response === 'volume Success') {
                this.playerState.mute = false;
                this.setStateAsync('player.muted', this.playerState.mute);
                this.setStateAsync('playbackInfo.mute', this.playerState.mute);
            } else {
                this.log.warn(`Playpack unmute was not successful: ${r.response}`);
            }
        });
    }

    playbackPause(): void {
        this.sendCmd<ApiResonse>('pause').then( r => {
            if (r.response === 'pause Success') {
                this.playerState.status = 'pause';
                this.setStateAsync('playbackInfo.status', 'pause', true);
            } else {
                this.log.warn(`Playpack pause was not successful: ${r.response}`);
            }
        });
    }

    playbackPlay(n?: any): void {
        if (n && !isNumber(n)) {
            this.log.warn('player.playN state change. Invalid state value passed');
            return;
        }
        const cmdTxt = `play${n ? (`&N=${n}`) : ``}`;
        this.sendCmd<ApiResonse>(cmdTxt).then( r => {
            if (r.response === 'play Success') {
                this.playerState.status = 'play';
                this.setStateAsync('playbackInfo.status', 'play', true);
            } else {
                this.log.warn(`Playpack play was not successful: ${r.response}`);
            }
        });
    }

    playbackStop(): void {
        this.sendCmd<ApiResonse>('stop').then( r => {
            if (r.response === 'stop Success') {
                this.playerState.status = 'stop';
                this.setStateAsync('playbackInfo.status', 'stop', true);
            } else {
                this.log.warn(`Playpack stop was not successful: ${r.response}`);
            }
        });
    }

    playbackToggle(): void {
        this.sendCmd<ApiResonse>('toggle').then( r => {
            if (r.response === 'toggle Success') {
                if (this.playerState.status == 'play') {
                    this.playerState.status = 'pause'
                } else if (this.playerState.status == 'pause' || this.playerState.status == 'stop') {
                    this.playerState.status = 'play'
                }
            } else {
                this.log.warn(`Playpack toggle was not successful: ${r.response}`);
            }

        });
    }

    volumeSetTo(value: any): void {
        if (!isNumber(value)) {
            this.log.warn('volume state change. Invalid state value passed');
            return;
        } else if ((!value && value !== 0) || value > 100 || value < 0) {
            this.log.warn('volume state change. Invalid state value passed');
            return;
        }
        this.sendCmd<ApiResonse>(`volume&volume=${value}`).then( r => {
            if (r.response === 'volume Success') {
                this.playerState.volume = value as number;
                this.setStateAsync('player.volume', value as number, true);
                this.setStateAsync('playbackInfo.volume', value as number, true);
            } else {
                this.log.warn(`Volume change was not successful: ${r.response}`);
            }
        });

    }

    volumeUp(): void {
        if(!this.playerState.volume) { // if volume unknown set to 0
            this.playerState.volume = 0;
        }
        const newVolumeValue = ((this.playerState.volume+10) > 100) ? 100 : this.playerState.volume+10;
        this.volumeSetTo(newVolumeValue);
    }

    volumeDown(): void {
        if(!this.playerState.volume) { // if volume unknown set to 10
            this.playerState.volume = 10;
        }
        const newVolumeValue = ((this.playerState.volume-10) < 0) ? 0 : this.playerState.volume-10;
        this.volumeSetTo(newVolumeValue);
    }

    setRandomPlayback(val: any): void {
        if (typeof val !== 'boolean') {
            this.log.warn('player.random state change. Invalid state value passed');
            return;
        }
        this.sendCmd<ApiResonse>(`random&value=${val}`).then( r => {
            if (r.response === 'random Success') {
                this.playerState.random = val;
                this.setStateAsync('playbackInfo.random', this.playerState.random, true);
                this.setStateAsync('queue.shuffleMode', (val ? 1 : 0), true);
            } else {
                this.log.warn(`Random playback change was not successful: ${r.response}`);
            }
        });
    }

    async subscribeToVolumioNotifications(): Promise<void> {
        // check if already subscribed
        const urls = JSON.stringify(await this.apiGet<string>('pushNotificationUrls'));
        if (urls.includes(`${ipInfo.address()}:${this.config.subscriptionPort}`)) {
            this.log.debug('Already subscribed to volumio push notifications');
            return;
        }
        // enter local http server as notification url
        const data = {'url':`http://${ipInfo.address()}:${this.config.subscriptionPort}/volumiostatus`};
        const res = await this.apiPost('pushNotificationUrls', data) as any;
        if (!res || !res.success || res.success !== true) {
            this.log.error(`Binding subscription url failed: ${res.error ? res.error : 'Unknown error'}`);
        }
    }

    async unsubscribeFromVolumioNotifications(): Promise<void> {
        // check if was subscribed
        const urls = JSON.stringify(await this.apiGet<string>('pushNotificationUrls'));
        if (!urls.includes(`${ipInfo.address()}:${this.config.subscriptionPort}`)) {
            this.log.debug('Subscription was not active. No need to unsubscribe')
            return
        }
        // remove local http server from notification urls
        const data = {'url':`http://${ipInfo.address()}:${this.config.subscriptionPort}/volumiostatus`};
        const res = await this.apiDelete('pushNotificationUrls', data) as any;
        if (!res || !res.success || res.success !== true) {
            this.log.error(`Removing subscription url failed: ${res.error ? res.error : 'Unknown error'}`);
        }
    }

    onVolumioStateChange(msg : StateChangeMsg) : void {
        if (!msg || !msg.item) {
            this.log.warn(`Unprocessable state change message received: ${JSON.stringify(msg)}`);
            return;
        }
        if (msg.item === 'state') {
            this.propagatePlayserStateIntoStates(msg.data as PlayerState);
        } else if (msg.item === 'queue') {
            // not implemented yet
        } else {
            this.log.warn(`Unknown state change event: '${msg.data}'`);
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