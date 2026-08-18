/**
 * Timer abstraction used by the Volumio clients.
 *
 * ioBroker adapters should register their intervals/timeouts via
 * `adapter.setInterval()`/`adapter.setTimeout()` (and the matching
 * `clear*` methods) instead of the global functions, so js-controller
 * can track and clean them up automatically (e.g. on unload or in
 * compact mode). Since the client classes here are plain, adapter-agnostic
 * classes (also used standalone, e.g. from test-client.js), they accept
 * an optional `TimerApi` - when the adapter passes itself (or an object
 * with matching methods) as `timers` in the client config, its timer
 * methods are used; otherwise this falls back to the global timer
 * functions.
 */
export interface TimerApi {
    setInterval: (callback: () => void, ms: number) => any;
    clearInterval: (timer: any) => void;
    setTimeout: (callback: () => void, ms: number) => any;
    clearTimeout: (timer: any) => void;
}

export const globalTimers: TimerApi = {
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: timer => clearInterval(timer),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: timer => clearTimeout(timer),
};
