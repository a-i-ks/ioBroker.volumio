/*
 * Created with @iobroker/create-adapter v1.31.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';
import {PlayerState} from './types';
import axios, { AxiosInstance } from 'axios';
// Load your modules here, e.g.:
// import * as fs from "fs";



class Volumio extends utils.Adapter {

    private playerState : PlayerState;

    static readonly namespace = 'volumio.0.';

    axiosInstance: AxiosInstance;

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
        this.playerState = ne;
        this.axiosInstance = axios.create();
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
    private onUnload(callback: () => void): void {
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

        switch(id.replace(`${this.namespace}.`,``)) {
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
                if(!state.val || !isNumber(state.val)) {
                    this.log.warn('player.playN state change. Invalid state value passed');
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
                if(!isNumber(state.val)) {
                    this.log.warn('player.volume state change. Invalid state value passed');
                    break;
                } else if (!state.val || state.val > 100 || state.val < 0) {
                    this.log.warn('player.volume state change. Invalid state value passed');
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
                if(!state.val || typeof state.val !== 'boolean') {
                    this.log.warn('player.repeatTrackState state change. Invalid state value passed');
                    break;
                }
                this.sendCmd(`repeat&value=${state.val}`);
                this.playerState.repeat = state.val;
                break;
        }


    }

    async sendCmd<T>(cmd: string) : Promise<T> {
        return this.apiGet<T>(`?cmd=${cmd}`);
    }

    async apiGet<T>(url: string): Promise<T> {
        return await this.axiosInstance.get(url).then( res => {
            if (!res.status) {
                throw new Error(res.statusText)
            }
            return res.data;
        });
    }

    async updatePlayerState() : Promise<void> {
        this.playerState = await this.apiGet<PlayerState>('getState');
        this.propagatePlayserStateIntoStates(this.playerState);
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    async propagatePlayserStateIntoStates(playerState: PlayerState) {
        await this.setStateAsync('playbackInfo.album', playerState.album);
        await this.setStateAsync('playbackInfo.albumart', playerState.albumart);
        await this.setStateAsync('playbackInfo.artist', playerState.artist);
        await this.setStateAsync('playbackInfo.bitdepth', playerState.bitdepth);
        await this.setStateAsync('playbackInfo.channels', playerState.channels);
        await this.setStateAsync('playbackInfo.consume', playerState.consume);
        await this.setStateAsync('playbackInfo.disableVolumeControl', playerState.disableVolumeControl);
        await this.setStateAsync('playbackInfo.duration', playerState.duration);
        await this.setStateAsync('player.muted', playerState.mute);
        await this.setStateAsync('playbackInfo.mute', playerState.mute);
        await this.setStateAsync('playbackInfo.position', playerState.position);
        await this.setStateAsync('playbackInfo.random', playerState.random);
        await this.setStateAsync('playbackInfo.repeat', playerState.repeat);
        await this.setStateAsync('playbackInfo.repeatSingle', playerState.repeatSingle);
        await this.setStateAsync('queue.repeatTrackState', playerState.repeatSingle);
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
        await this.setStateAsync('player.volume', playerState.volume);
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

function isNumber(value: any): boolean
{
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