export interface PlayerState {
    status: string;
    position: string;
    title: string;
    artist: string;
    album: string;
    albumart: string;
    uri: string;
    trackType: string;
    seek: number;
    duration: number;
    samplerate: string;
    bitdepth: string;
    channels: number;
    random: boolean;
    repeat: boolean;
    repeatSingle: boolean;
    consume: boolean;
    volume: number;
    disableVolumeControl: boolean;
    mute: boolean;
    stream: string;
    updatedb: boolean;
    volatile: boolean;
    service: string;
}

export interface QueueObj {
    uri: string;
    service: string;
    name: string;
    artist: string;
    album: string;
    type: string;
    tracknumber: number;
    albumart: string;
    duration: number;
    samplerate: string;
    bitdepth: string;
    trackType: string;
    channels: number;
}


export interface StateChangeMsg {
    item: string,
    data: PlayerState | QueueObj[]
}