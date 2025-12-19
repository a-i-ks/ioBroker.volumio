"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var volumioClientFactory_exports = {};
__export(volumioClientFactory_exports, {
  VolumioClientFactory: () => VolumioClientFactory
});
module.exports = __toCommonJS(volumioClientFactory_exports);
var import_restVolumioClient = require("./restVolumioClient");
var import_websocketVolumioClient = require("./websocketVolumioClient");
class VolumioClientFactory {
  /**
   * Create a Volumio client based on the specified API mode
   *
   * @param config
   */
  static create(config) {
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
  static createRestClient(config) {
    const restConfig = {
      host: config.host,
      port: config.port,
      pollInterval: config.pollInterval || 2e3
    };
    return new import_restVolumioClient.RestVolumioClient(restConfig);
  }
  /**
   * Create a WebSocket client
   *
   * @param config
   */
  static createWebSocketClient(config) {
    const wsConfig = {
      host: config.host,
      port: config.port,
      reconnectAttempts: config.reconnectAttempts || 5,
      reconnectDelay: config.reconnectDelay || 2e3
    };
    return new import_websocketVolumioClient.WebSocketVolumioClient(wsConfig);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  VolumioClientFactory
});
//# sourceMappingURL=volumioClientFactory.js.map
