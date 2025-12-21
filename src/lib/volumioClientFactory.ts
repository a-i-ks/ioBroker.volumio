/**
 * Factory for creating Volumio API clients
 *
 * Creates either REST or WebSocket clients based on configuration.
 */

import type { IVolumioClient } from "./volumioClient";
import { RestVolumioClient } from "./restVolumioClient";
import type { RestClientConfig } from "./restVolumioClient";
import { WebSocketVolumioClient } from "./websocketVolumioClient";
import type { WebSocketClientConfig } from "./websocketVolumioClient";
import type { Logger } from "./logger";

export type ApiMode = "rest" | "websocket";

export interface VolumioClientFactoryConfig {
  apiMode: ApiMode;
  host: string;
  port: number;
  pollInterval?: number; // For REST mode only
  reconnectAttempts?: number; // For WebSocket mode only
  reconnectDelay?: number; // For WebSocket mode only
  socketPath?: string; // For WebSocket mode only - Socket.IO path
  transports?: ("websocket" | "polling")[]; // For WebSocket mode only - Transport methods
  timeout?: number; // For WebSocket mode only - Connection timeout
  forceNew?: boolean; // For WebSocket mode only - Force new connection
  validateConnection?: boolean; // For WebSocket mode only - Validate connection after connect
  logger?: Logger; // Optional logger instance
}

export class VolumioClientFactory {
  /**
   * Create a Volumio client based on the specified API mode
   *
   * @param config
   */
  static create(config: VolumioClientFactoryConfig): IVolumioClient {
    if (config.apiMode === "websocket") {
      return VolumioClientFactory.createWebSocketClient(config);
    }
    return VolumioClientFactory.createRestClient(config);
  }

  /**
   * Create a REST API client
   *
   * @param config
   */
  private static createRestClient(
    config: VolumioClientFactoryConfig,
  ): IVolumioClient {
    const restConfig: RestClientConfig = {
      host: config.host,
      port: config.port,
      pollInterval: config.pollInterval || 2000,
      logger: config.logger, // Pass logger
    };
    return new RestVolumioClient(restConfig);
  }

  /**
   * Create a WebSocket client
   *
   * @param config
   */
  private static createWebSocketClient(
    config: VolumioClientFactoryConfig,
  ): IVolumioClient {
    const wsConfig: WebSocketClientConfig = {
      host: config.host,
      port: config.port,
      reconnectAttempts: config.reconnectAttempts || 5,
      reconnectDelay: config.reconnectDelay || 2000,
      socketPath: config.socketPath, // Pass Socket.IO path
      transports: config.transports, // Pass transport methods
      timeout: config.timeout, // Pass connection timeout
      forceNew: config.forceNew, // Pass forceNew flag
      validateConnection: config.validateConnection, // Pass validation flag
      logger: config.logger, // Pass logger
    };
    return new WebSocketVolumioClient(wsConfig);
  }
}
