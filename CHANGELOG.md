# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0] - 2025-01-XX

### 🎉 Added - Dual API Support

This is a **major milestone release** before version 1.0.0, introducing dual API support for both WebSocket and REST communication modes.

#### New Features
- **WebSocket Mode** (NEW - Default)
  - Real-time state updates via Socket.IO
  - Automatic reconnection with configurable retry settings (default: 5 attempts, 2 second delay)
  - Immediate state changes without polling delay
  - Lower network overhead
  - Perfect for responsive home automation scenarios

- **REST API Mode** (Enhanced)
  - Improved polling mechanism with configurable interval (default: 2 seconds)
  - Better error handling and connection management
  - Fallback option for environments where WebSocket is blocked
  - Optional HTTP push notifications (marked as deprecated)

- **Client Abstraction Layer**
  - Clean architecture with `IVolumioClient` interface
  - `RestVolumioClient` - REST API implementation with polling
  - `WebSocketVolumioClient` - Socket.IO based implementation
  - `VolumioClientFactory` - Dynamic client instantiation based on configuration

- **Configuration Options**
  - API mode selection: WebSocket (recommended) or REST
  - Poll interval configuration for REST mode
  - Reconnection attempts and delay for WebSocket mode
  - All settings configurable via adapter configuration UI

- **Unit Tests**
  - Comprehensive test suite for client implementations
  - 15 unit tests for client factory and implementations
  - All 72 tests passing (including package validation)

### 🔧 Changed

- **Complete API Communication Refactoring**
  - Migrated from direct axios calls to client abstraction layer
  - All playback control methods use unified client interface
  - All volume control methods use unified client interface
  - Queue management and playback options migrated to client interface

- **Improved Connection Management**
  - Better connection state tracking
  - Automatic reconnection for WebSocket mode
  - Connection state callbacks for both modes
  - Enhanced error handling

- **Enhanced Logging**
  - More detailed debug information
  - Connection state changes logged
  - API call errors properly logged
  - State change events logged in debug mode

### 📦 Dependencies

- **Added**
  - `socket.io-client@^4.8.1` - WebSocket communication
  - `@iobroker/eslint-config@^0.1.6` - ESLint 9 support

- **Updated**
  - `@iobroker/adapter-core` 3.1.4 → 3.3.2
  - `axios` 1.6.8 → 1.7.2
  - `express` 4.19.2 → 4.22.1
  - `body-parser` 1.19.2 → 1.20.4
  - `typescript` 5.0.4 → 5.5.4
  - `eslint` 8.57.0 → 9.39.2
  - `@typescript-eslint/*` 7.x → 8.x
  - `mocha` 10.4.0 → 11.0.1
  - `sinon` 17.0.2 → 19.0.2
  - All `@alcalzone/release-script` packages to 5.0.0
  - All `@iobroker/*` packages to latest versions

- **Removed**
  - `ip` package (HIGH severity SSRF vulnerability) - replaced with native `os.networkInterfaces()`

### 🏗️ Infrastructure

- **ESLint 9 Migration**
  - Migrated to flat config format (`eslint.config.mjs`)
  - Using `@iobroker/eslint-config` for consistent rules
  - Removed deprecated `.eslintrc.js` and `.eslintignore`
  - Disabled overly strict JSDoc rules for ioBroker context

- **NPM Trusted Publishing**
  - Migrated to OIDC-based authentication
  - No more NPM_TOKEN secrets needed
  - Enhanced security via GitHub Actions
  - Updated `.github/workflows/test-and-release.yml`

- **Repository Cleanup**
  - Fixed all ioBroker repository checker errors
  - Added responsive design attributes to jsonConfig
  - Updated minimum versions: js-controller >=5.0.19, admin >=6.17.14
  - Removed conflicting `.npmignore`

### ⚠️ Deprecated

- **HTTP Push Notifications** (REST mode only)
  - Marked as deprecated in configuration UI
  - Only visible when REST mode is selected
  - WebSocket mode provides superior real-time updates
  - Will be removed in future version

### 🐛 Fixed

- Security vulnerabilities in dependencies
- Adapter crashes from earlier versions
- Type safety issues throughout codebase
- Connection state tracking edge cases

### 📝 Documentation

- Updated README.md with dual API support information
- Added comprehensive API mode comparison
- Created `test-adapter.md` with detailed test scenarios
- Created `test-client.js` for standalone client testing
- Enhanced inline code documentation

### 🔒 Security

- Removed `ip` package (SSRF vulnerability)
- Updated all dependencies to secure versions
- No HIGH or CRITICAL vulnerabilities (npm audit)
- Migrated to NPM Trusted Publishing for secure releases

---

## [0.2.0] - 2024-05-21

### Changed
- Updated to newest ioBroker adapter structure
- Fixed adapter crashes

## [0.1.3]

### Security
- Security patches

## [0.1.2]

### Fixed
- Minor bug fixes

## [0.1.0]

### Changed
- Complete reworked adapter
- Switched codebase to TypeScript
- Changed License to MIT

## [0.0.1] - Initial Release

### Added
- Initial release with basic Volumio control
- REST API support
- Basic playback control
- Volume control
- Queue management

---

[Unreleased]: https://github.com/a-i-ks/ioBroker.volumio/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/a-i-ks/ioBroker.volumio/compare/v0.2.0...v0.9.0
[0.2.0]: https://github.com/a-i-ks/ioBroker.volumio/compare/v0.1.3...v0.2.0
