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

export type ApiMode = "rest" | "websocket";

export interface VolumioClientFactoryConfig {
  apiMode: ApiMode;
  host: string;
  port: number;
  pollInterval?: number; // For REST mode only
  reconnectAttempts?: number; // For WebSocket mode only
  reconnectDelay?: number; // For WebSocket mode only
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
    };
    return new WebSocketVolumioClient(wsConfig);
  }
}
