/**
 * Live integration test against a real, reachable Volumio instance.
 *
 * This is NOT part of `npm test` / CI, since CI has no access to a real
 * Volumio device. Run manually against the local test VM (see
 * ../../vm/start.sh in the volumio-emulator workspace) or any other
 * reachable Volumio instance:
 *
 *   npm run test:live
 *   VOLUMIO_HOST=volumio.local npm run test:live
 *
 * The whole suite is skipped automatically if no Volumio instance is
 * reachable at VOLUMIO_HOST:VOLUMIO_PORT within a short timeout.
 */

import { expect } from 'chai';
import { VolumioClientFactory } from '../src/lib/volumioClientFactory';
import type { IVolumioClient } from '../src/lib/volumioClient';

const HOST = process.env.VOLUMIO_HOST || 'localhost';
const PORT = Number(process.env.VOLUMIO_PORT) || 3000;
const PROBE_TIMEOUT_MS = 5000;

/**
 * Quick reachability probe so the suite skips cleanly (instead of timing
 * out slowly per test) when no Volumio instance is available.
 */
async function isVolumioReachable(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
        const response = await fetch(`http://${HOST}:${PORT}/api/v1/getState`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Polls getState() until the `random` flag matches the expected value or
 * a timeout is reached (Volumio's state broadcast can lag slightly behind
 * a command's acknowledgement, especially over WebSocket).
 */
async function waitForRandomState(client: IVolumioClient, expected: boolean, timeoutMs = 5000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    let current = Boolean((await client.getState()).random);
    while (current !== expected && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 300));
        current = Boolean((await client.getState()).random);
    }
    return current;
}

describe('Live Volumio integration', function () {
    this.timeout(30000);

    let reachable = false;

    before(async function () {
        reachable = await isVolumioReachable();
        if (!reachable) {
            console.log(
                `    (skipping: no Volumio instance reachable at ${HOST}:${PORT} - start the test VM first, see vm/start.sh)`,
            );
            this.skip();
        }
    });

    for (const apiMode of ['rest', 'websocket'] as const) {
        describe(`${apiMode} client`, () => {
            let client: IVolumioClient;

            beforeEach(() => {
                client = VolumioClientFactory.create({
                    apiMode,
                    host: HOST,
                    port: PORT,
                    pollInterval: 1000,
                    reconnectAttempts: 2,
                    reconnectDelay: 500,
                });
            });

            afterEach(async () => {
                if (client?.isConnected()) {
                    await client.disconnect();
                }
            });

            it('connects successfully', async () => {
                await client.connect();
                expect(client.isConnected()).to.be.true;
            });

            it('responds to ping', async () => {
                await client.connect();
                const result = await client.ping();
                expect(result).to.be.true;
            });

            it('returns system info with expected shape', async () => {
                await client.connect();
                const info = await client.getSystemInfo();
                expect(info).to.be.an('object');
                expect(info.hardware).to.be.a('string');
            });

            it('returns player state with expected shape', async () => {
                await client.connect();
                const state = await client.getState();
                expect(state).to.be.an('object');
                expect(state.status).to.be.a('string');
                expect(['play', 'pause', 'stop']).to.include(state.status);
            });

            it('accepts a random-playback toggle command and reflects it in state (round-trip, restores original value)', async () => {
                await client.connect();
                const before = await client.getState();
                const original = Boolean(before.random);

                await client.setRandom(!original);
                expect(await waitForRandomState(client, !original)).to.equal(!original);

                // Restore original state so the live test has no lasting side effects
                await client.setRandom(original);
                expect(await waitForRandomState(client, original)).to.equal(original);
            });

            it('disconnects cleanly', async () => {
                await client.connect();
                await client.disconnect();
                expect(client.isConnected()).to.be.false;
            });
        });
    }
});
