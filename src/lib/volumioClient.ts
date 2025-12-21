/**
 * Volumio API Client Interface
 *
 * This interface defines the contract for communicating with Volumio music players.
 * It can be implemented using either REST API or WebSocket connections.
 */

/**
 * Volumio player state information
 */
export interface VolumioState {
  /**
   *
   */
  status?: string; // e.g., "play", "pause", "stop"
  position?: number; // Current position in track (seconds)
  /**
   *
   */
  title?: string; // Current track title
  artist?: string; // Current track artist
  /**
   *
   */
  album?: string; // Current track album
  albumart?: string; // Album artwork URL
  uri?: string; // Track URI
  /**
   *
   */
  trackType?: string; // e.g., "mp3", "flac", "webradio"
  seek?: number; // Current seek position (milliseconds)
  /**
   *
   */
  duration?: number; // Track duration (seconds)
  /**
   *
   */
  samplerate?: string; // e.g., "44.1 KHz"
  /**
   *
   */
  bitdepth?: string; // e.g., "16 bit"
  /**
   *
   */
  bitrate?: string; // e.g., "320 kbps"
  /**
   *
   */
  channels?: number; // Number of audio channels
  random?: boolean; // Random playback enabled
  repeat?: boolean; // Repeat enabled
  /**
   *
   */
  repeatSingle?: boolean; // Repeat single track
  consume?: boolean; // Consume mode (remove played tracks)
  /**
   *
   */
  volume?: number; // Volume level (0-100)
  /**
   *
   */
  mute?: boolean; // Mute state
  /**
   *
   */
  stream?: string; // Stream type
  updatedb?: boolean; // Database update in progress
  /**
   *
   */
  volatile?: boolean; // Volatile state
  service?: string; // Service name (e.g., "mpd", "spop")
}

/**
 * Volumio system information
 */
export interface VolumioSystemInfo {
  /**
   *
   */
  id?: string;
  /**
   *
   */
  host?: string;
  name?: string;
  /**
   *
   */
  type?: string;
  serviceName?: string;
  /**
   *
   */
  serviceVersion?: string;
  deviceType?: string;
  /**
   *
   */
  systemVersion?: string;
  buildDate?: string;
  /**
   *
   */
  variant?: string;
  hardware?: string;
}

/**
 * Callback for player state changes
 */
export type StateChangeCallback = (state: VolumioState) => void;

/**
 * Callback for connection state changes
 */
export type ConnectionStateCallback = (connected: boolean) => void;

/**
 * Interface for Volumio API clients
 *
 * Implementations: RestVolumioClient, WebSocketVolumioClient
 */
export interface IVolumioClient {
  /**
   * Connect to the Volumio instance
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the Volumio instance
   */
  disconnect(): Promise<void>;

  /**
   * Check if currently connected
   */
  isConnected(): boolean;

  /**
   * Ping the Volumio instance to check connectivity
   */
  ping(): Promise<boolean>;

  /**
   * Register callback for player state changes
   */
  onStateChange(callback: StateChangeCallback): void;

  /**
   * Register callback for connection state changes
   */
  onConnectionChange(callback: ConnectionStateCallback): void;

  /**
   * Get current player state
   */
  getState(): Promise<VolumioState>;

  /**
   * Get system information
   */
  getSystemInfo(): Promise<VolumioSystemInfo>;

  // ==================== Playback Control ====================

  /**
   * Start playback
   *
   * @param n Optional track number in queue
   */
  play(n?: number): Promise<void>;

  /**
   * Pause playback
   */
  pause(): Promise<void>;

  /**
   * Stop playback
   */
  stop(): Promise<void>;

  /**
   * Toggle play/pause
   */
  toggle(): Promise<void>;

  /**
   * Skip to next track
   */
  next(): Promise<void>;

  /**
   * Skip to previous track
   */
  previous(): Promise<void>;

  /**
   * Seek to position in current track
   *
   * @param position Position in seconds
   */
  seek(position: number): Promise<void>;

  // ==================== Volume Control ====================

  /**
   * Set volume level
   *
   * @param volume Volume level (0-100)
   */
  setVolume(volume: number): Promise<void>;

  /**
   * Increase volume by configured step
   */
  volumePlus(): Promise<void>;

  /**
   * Decrease volume by configured step
   */
  volumeMinus(): Promise<void>;

  /**
   * Mute audio
   */
  mute(): Promise<void>;

  /**
   * Unmute audio
   */
  unmute(): Promise<void>;

  /**
   * Toggle mute state
   */
  toggleMute(): Promise<void>;

  // ==================== Queue Management ====================

  /**
   * Clear the playback queue
   */
  clearQueue(): Promise<void>;

  // ==================== Playback Options ====================

  /**
   * Enable or disable random playback
   */
  setRandom(enabled: boolean): Promise<void>;

  /**
   * Enable or disable repeat
   */
  setRepeat(enabled: boolean): Promise<void>;

  /**
   * Enable or disable repeat single track
   */
  setRepeatSingle(enabled: boolean): Promise<void>;
}
