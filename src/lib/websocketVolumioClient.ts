/**
 * WebSocket implementation of Volumio Client
 *
 * This client communicates with Volumio using Socket.IO WebSocket connections.
 * Real-time state updates are received via 'pushState' events.
 */

import io from "socket.io-client";
import type {
	IVolumioClient,
	VolumioState,
	VolumioSystemInfo,
	StateChangeCallback,
	ConnectionStateCallback,
} from "./volumioClient";
import type { Logger } from "./logger";
import { NoOpLogger } from "./logger";

export interface WebSocketClientConfig {
	host: string;
	port: number;
	reconnectAttempts?: number; // Number of reconnection attempts (default: 5)
	reconnectDelay?: number; // Delay between reconnection attempts in ms (default: 2000)
	socketPath?: string; // Socket.IO path (default: "/socket.io")
	transports?: ("websocket" | "polling")[]; // Transport methods (default: ["websocket", "polling"])
	timeout?: number; // Connection timeout in ms (default: 10000)
	forceNew?: boolean; // Force new connection (default: false)
	validateConnection?: boolean; // Validate connection after connect (default: true)
	logger?: Logger; // Logger instance (optional)
}

export class WebSocketVolumioClient implements IVolumioClient {
	private config: Required<WebSocketClientConfig>;
	private socket?: SocketIOClient.Socket;
	private connected: boolean = false;
	private logger: Logger;
	private stateChangeCallbacks: StateChangeCallback[] = [];
	private connectionChangeCallbacks: ConnectionStateCallback[] = [];

	constructor(config: WebSocketClientConfig) {
		this.config = {
			...config,
			reconnectAttempts: config.reconnectAttempts ?? 5,
			reconnectDelay: config.reconnectDelay ?? 2000,
			socketPath: config.socketPath ?? "/socket.io",
			transports: config.transports ?? ["websocket", "polling"],
			timeout: config.timeout ?? 10000,
			forceNew: config.forceNew ?? false,
			validateConnection: config.validateConnection !== false, // Default: true
			logger: config.logger ?? new NoOpLogger(),
		};

		this.logger = this.config.logger;
		this.logger.debug(
			`WebSocket client initialized: ${this.config.host}:${this.config.port} (path: ${this.config.socketPath})`,
		);
	}

	async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			const url = `http://${this.config.host}:${this.config.port}`;

			this.logger.info(
				`Connecting to Volumio via WebSocket: ${url} (path: ${this.config.socketPath}, transports: ${this.config.transports.join(", ")})`,
			);
			this.logger.debug(
				`Socket.IO config: reconnectAttempts=${this.config.reconnectAttempts}, reconnectDelay=${this.config.reconnectDelay}ms, timeout=${this.config.timeout}ms`,
			);

			this.socket = io(url, {
				path: this.config.socketPath,
				transports: this.config.transports,
				reconnection: true,
				reconnectionAttempts: this.config.reconnectAttempts,
				reconnectionDelay: this.config.reconnectDelay,
				timeout: this.config.timeout,
				forceNew: this.config.forceNew,
			});

			let initialConnectionResolved = false;

			// Connection successful
			this.socket.on("connect", async () => {
				const transportName = (this.socket?.io as any)?.engine?.transport?.name;
				this.logger.info(`WebSocket connected successfully (transport: ${transportName})`);
				this.connected = true;
				this.notifyConnectionChange(true);

				// Validate connection if enabled
				if (this.config.validateConnection && !initialConnectionResolved) {
					this.logger.debug("Validating connection with getState() call...");
					try {
						await this.getState();
						this.logger.debug("Connection validation successful");
						initialConnectionResolved = true;
						resolve();
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						this.logger.error(`Connection validation failed: ${errorMessage}`);
						initialConnectionResolved = true;
						this.socket?.disconnect();
						reject(new Error(`WebSocket connected but validation failed: ${errorMessage}`));
					}
				} else if (!initialConnectionResolved) {
					initialConnectionResolved = true;
					resolve();
				}
			});

			// Disconnection
			this.socket.on("disconnect", (reason: string) => {
				this.logger.warn(`WebSocket disconnected: ${reason}`);
				this.connected = false;
				this.notifyConnectionChange(false);
			});

			// Connection error (initial connection and reconnection attempts)
			this.socket.on("connect_error", (error: Error) => {
				const errorDetails = {
					message: error.message,
					type: error.name,
					description: (error as any).description,
					context: (error as any).context,
				};

				this.logger.error(`WebSocket connection error: ${JSON.stringify(errorDetails)}`);
				this.logger.debug(
					`Connection attempt to ${url} failed. Transport: ${(this.socket?.io as any)?.engine?.transport?.name || "unknown"}`,
				);

				if (!initialConnectionResolved) {
					initialConnectionResolved = true;
					reject(
						new Error(
							`Failed to connect to Volumio at ${this.config.host}:${this.config.port} - ${error.message}`,
						),
					);
				} else {
					// Log reconnection attempts
					this.logger.warn(`Reconnection attempt failed: ${error.message} (will retry)`);
				}
			});

			// Reconnection attempt
			this.socket.io.on("reconnect_attempt", (attempt: number) => {
				this.logger.debug(`WebSocket reconnection attempt ${attempt}/${this.config.reconnectAttempts}`);
			});

			// Reconnection failed (all attempts exhausted)
			this.socket.io.on("reconnect_failed", () => {
				this.logger.error(
					`WebSocket reconnection failed after ${this.config.reconnectAttempts} attempts`,
				);
			});

			// Reconnection successful
			this.socket.io.on("reconnect", (attempt: number) => {
				this.logger.info(`WebSocket reconnected successfully after ${attempt} attempt(s)`);
			});

			// Listen for state updates
			this.socket.on("pushState", (state: VolumioState) => {
				this.logger.silly(`Received pushState event: ${JSON.stringify(state)}`);
				this.notifyStateChange(state);
			});

			// Connection timeout
			setTimeout(() => {
				if (!initialConnectionResolved) {
					this.logger.error(`Connection timeout after ${this.config.timeout}ms`);
					initialConnectionResolved = true;
					this.socket?.disconnect();
					reject(
						new Error(
							`Connection timeout: No response from Volumio at ${this.config.host}:${this.config.port} after ${this.config.timeout}ms`,
						),
					);
				}
			}, this.config.timeout + 1000); // Add 1s buffer
		});
	}

	async disconnect(): Promise<void> {
		this.logger.info("Disconnecting WebSocket client...");
		if (this.socket) {
			this.socket.disconnect();
			this.socket = undefined;
			this.logger.debug("WebSocket disconnected");
		}
		this.connected = false;
		this.notifyConnectionChange(false);
	}

	isConnected(): boolean {
		return this.connected && this.socket?.connected === true;
	}

	async ping(): Promise<boolean> {
		return this.isConnected();
	}

	onStateChange(callback: StateChangeCallback): void {
		this.stateChangeCallbacks.push(callback);
	}

	onConnectionChange(callback: ConnectionStateCallback): void {
		this.connectionChangeCallbacks.push(callback);
	}

	async getState(): Promise<VolumioState> {
		return this.sendCommand<VolumioState>("getState");
	}

	async getSystemInfo(): Promise<VolumioSystemInfo> {
		return this.sendCommand<VolumioSystemInfo>("getSystemInfo");
	}

	// ==================== Playback Control ====================

	async play(n?: number): Promise<void> {
		if (n !== undefined) {
			await this.sendCommand("play", { value: n });
		} else {
			await this.sendCommand("play");
		}
	}

	async pause(): Promise<void> {
		await this.sendCommand("pause");
	}

	async stop(): Promise<void> {
		await this.sendCommand("stop");
	}

	async toggle(): Promise<void> {
		await this.sendCommand("toggle");
	}

	async next(): Promise<void> {
		await this.sendCommand("next");
	}

	async previous(): Promise<void> {
		await this.sendCommand("prev");
	}

	async seek(position: number): Promise<void> {
		await this.sendCommand("seek", { position });
	}

	// ==================== Volume Control ====================

	async setVolume(volume: number): Promise<void> {
		if (volume < 0 || volume > 100) {
			throw new Error("Volume must be between 0 and 100");
		}
		await this.sendCommand("volume", { value: volume });
	}

	async volumePlus(): Promise<void> {
		await this.sendCommand("volume", { value: "plus" });
	}

	async volumeMinus(): Promise<void> {
		await this.sendCommand("volume", { value: "minus" });
	}

	async mute(): Promise<void> {
		await this.sendCommand("mute");
	}

	async unmute(): Promise<void> {
		await this.sendCommand("unmute");
	}

	async toggleMute(): Promise<void> {
		await this.sendCommand("mute", { value: "toggle" });
	}

	// ==================== Queue Management ====================

	async clearQueue(): Promise<void> {
		await this.sendCommand("clearQueue");
	}

	// ==================== Playback Options ====================

	async setRandom(enabled: boolean): Promise<void> {
		await this.sendCommand("random", { value: enabled });
	}

	async setRepeat(enabled: boolean): Promise<void> {
		await this.sendCommand("repeat", { value: enabled });
	}

	async setRepeatSingle(enabled: boolean): Promise<void> {
		await this.sendCommand("repeatSingle", { value: enabled });
	}

	// ==================== Private Methods ====================

	private async sendCommand<T = void>(command: string, data?: Record<string, unknown>): Promise<T> {
		return new Promise((resolve, reject) => {
			if (!this.socket || !this.connected) {
				const error = "Not connected to Volumio";
				this.logger.error(`sendCommand(${command}) failed: ${error}`);
				reject(new Error(error));
				return;
			}

			this.logger.debug(`Sending command: ${command}${data ? ` with data: ${JSON.stringify(data)}` : ""}`);

			// For commands that return data (like getState)
			if (command === "getState") {
				// Volumio responds to getState with a pushState event
				this.socket.emit(command);

				// Add timeout for response
				const timeout = setTimeout(() => {
					this.logger.warn(`Command ${command} response timeout after 5s`);
					reject(new Error(`Timeout waiting for ${command} response`));
				}, 5000);

				this.socket.once("pushState", (response: T) => {
					clearTimeout(timeout);
					this.logger.silly(`Received ${command} response via pushState: ${JSON.stringify(response)}`);
					resolve(response);
				});
			} else if (command === "getSystemInfo") {
				// getSystemInfo returns data directly
				this.socket.emit(command);

				// Add timeout for response
				const timeout = setTimeout(() => {
					this.logger.warn(`Command ${command} response timeout after 5s`);
					reject(new Error(`Timeout waiting for ${command} response`));
				}, 5000);

				this.socket.once(command, (response: T) => {
					clearTimeout(timeout);
					this.logger.silly(`Received ${command} response: ${JSON.stringify(response)}`);
					resolve(response);
				});
			} else {
				// For commands that don't return data
				if (data) {
					this.socket.emit(command, data);
				} else {
					this.socket.emit(command);
				}
				this.logger.debug(`Command ${command} sent successfully`);
				resolve(undefined as T);
			}
		});
	}

	private notifyStateChange(state: VolumioState): void {
		this.logger.debug("Notifying state change callbacks");
		for (const callback of this.stateChangeCallbacks) {
			try {
				callback(state);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				this.logger.error(`State change callback error: ${errorMessage}`);
			}
		}
	}

	private notifyConnectionChange(connected: boolean): void {
		this.logger.debug(`Notifying connection change: ${connected}`);
		for (const callback of this.connectionChangeCallbacks) {
			try {
				callback(connected);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				this.logger.error(`Connection change callback error: ${errorMessage}`);
			}
		}
	}
}
