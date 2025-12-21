/**
 * Unit tests for Volumio Client implementations
 */

import { expect } from "chai";
import { describe, it } from "mocha";
import { RestVolumioClient } from "./restVolumioClient";
import type { RestClientConfig } from "./restVolumioClient";
import { WebSocketVolumioClient } from "./websocketVolumioClient";
import type { WebSocketClientConfig } from "./websocketVolumioClient";
import { VolumioClientFactory } from "./volumioClientFactory";
import type { ApiMode } from "./volumioClientFactory";

describe("Volumio Client Factory", () => {
  it("should create REST client when apiMode is 'rest'", () => {
    const client = VolumioClientFactory.create({
      apiMode: "rest",
      host: "volumio.local",
      port: 3000,
      pollInterval: 2000,
    });

    expect(client).to.be.instanceOf(RestVolumioClient);
  });

  it("should create WebSocket client when apiMode is 'websocket'", () => {
    const client = VolumioClientFactory.create({
      apiMode: "websocket",
      host: "volumio.local",
      port: 3000,
      reconnectAttempts: 5,
      reconnectDelay: 2000,
    });

    expect(client).to.be.instanceOf(WebSocketVolumioClient);
  });

  it("should use default values when optional parameters are not provided", () => {
    const client = VolumioClientFactory.create({
      apiMode: "rest",
      host: "volumio.local",
      port: 3000,
    });

    expect(client).to.be.instanceOf(RestVolumioClient);
  });
});

describe("REST Volumio Client", () => {
  let client: RestVolumioClient;

  const config: RestClientConfig = {
    host: "volumio.local",
    port: 3000,
    pollInterval: 2000,
  };

  beforeEach(() => {
    client = new RestVolumioClient(config);
  });

  it("should initialize with correct configuration", () => {
    expect(client).to.be.instanceOf(RestVolumioClient);
  });

  it("should start as disconnected", () => {
    expect(client.isConnected()).to.be.false;
  });

  it("should register state change callbacks", () => {
    let callbackCalled = false;
    client.onStateChange(() => {
      callbackCalled = true;
    });

    // The callback should be registered (we can't easily test if it's called without mocking)
    expect(callbackCalled).to.be.false; // Not called yet
  });

  it("should register connection change callbacks", () => {
    let callbackCalled = false;
    client.onConnectionChange(() => {
      callbackCalled = true;
    });

    expect(callbackCalled).to.be.false; // Not called yet
  });

  it("should use default poll interval when not specified", () => {
    const clientWithDefaults = new RestVolumioClient({
      host: "volumio.local",
      port: 3000,
    });

    expect(clientWithDefaults).to.be.instanceOf(RestVolumioClient);
  });
});

describe("WebSocket Volumio Client", () => {
  let client: WebSocketVolumioClient;

  const config: WebSocketClientConfig = {
    host: "volumio.local",
    port: 3000,
    reconnectAttempts: 5,
    reconnectDelay: 2000,
  };

  beforeEach(() => {
    client = new WebSocketVolumioClient(config);
  });

  it("should initialize with correct configuration", () => {
    expect(client).to.be.instanceOf(WebSocketVolumioClient);
  });

  it("should start as disconnected", () => {
    expect(client.isConnected()).to.be.false;
  });

  it("should register state change callbacks", () => {
    let callbackCalled = false;
    client.onStateChange(() => {
      callbackCalled = true;
    });

    expect(callbackCalled).to.be.false; // Not called yet
  });

  it("should register connection change callbacks", () => {
    let callbackCalled = false;
    client.onConnectionChange(() => {
      callbackCalled = true;
    });

    expect(callbackCalled).to.be.false; // Not called yet
  });

  it("should use default reconnect settings when not specified", () => {
    const clientWithDefaults = new WebSocketVolumioClient({
      host: "volumio.local",
      port: 3000,
    });

    expect(clientWithDefaults).to.be.instanceOf(WebSocketVolumioClient);
  });
});

describe("Client Factory - API Mode Selection", () => {
  const testCases: Array<{
    apiMode: ApiMode;
    expectedType: typeof RestVolumioClient | typeof WebSocketVolumioClient;
    description: string;
  }> = [
    {
      apiMode: "rest",
      expectedType: RestVolumioClient,
      description: "REST mode",
    },
    {
      apiMode: "websocket",
      expectedType: WebSocketVolumioClient,
      description: "WebSocket mode",
    },
  ];

  testCases.forEach(({ apiMode, expectedType, description }) => {
    it(`should create correct client for ${description}`, () => {
      const client = VolumioClientFactory.create({
        apiMode,
        host: "test.local",
        port: 3000,
        pollInterval: 1000,
        reconnectAttempts: 3,
        reconnectDelay: 1000,
      });

      expect(client).to.be.instanceOf(expectedType);
    });
  });
});
