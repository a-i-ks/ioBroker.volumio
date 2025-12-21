#!/usr/bin/env node
/**
 * Manual test script for Volumio clients
 *
 * Usage:
 *   node test-client.js websocket volumio.local
 *   node test-client.js rest volumio.local
 */

const { VolumioClientFactory } = require('./build/lib/volumioClientFactory');

const apiMode = process.argv[2] || 'websocket';
const host = process.argv[3] || 'volumio.local';
const port = 3000;

console.log(`\n🧪 Testing Volumio Client`);
console.log(`   Mode: ${apiMode.toUpperCase()}`);
console.log(`   Host: ${host}:${port}\n`);

async function testClient() {
    // Create client
    const client = VolumioClientFactory.create({
        apiMode: apiMode,
        host: host,
        port: port,
        pollInterval: 2000,
        reconnectAttempts: 3,
        reconnectDelay: 2000,
    });

    // Register callbacks
    client.onStateChange((state) => {
        console.log('📊 State Change:', {
            status: state.status,
            title: state.title,
            artist: state.artist,
            volume: state.volume,
        });
    });

    client.onConnectionChange((connected) => {
        console.log(connected ? '✅ Connected' : '❌ Disconnected');
    });

    try {
        // Test 1: Connect
        console.log('1️⃣  Testing connection...');
        await client.connect();
        console.log('   ✅ Connection successful\n');

        // Test 2: Get system info
        console.log('2️⃣  Getting system info...');
        const sysInfo = await client.getSystemInfo();
        console.log('   System:', sysInfo?.name || 'N/A');
        console.log('   Version:', sysInfo?.systemVersion || 'N/A');
        console.log('   Hardware:', sysInfo?.hardware || 'N/A\n');

        // Test 3: Get current state
        console.log('3️⃣  Getting current state...');
        const state = await client.getState();
        console.log('   Status:', state?.status || 'N/A');
        console.log('   Title:', state?.title || 'N/A');
        console.log('   Artist:', state?.artist || 'N/A');
        console.log('   Volume:', state?.volume || 'N/A\n');

        // Test 4: Ping
        console.log('4️⃣  Testing ping...');
        const pingResult = await client.ping();
        console.log('   Ping:', pingResult ? '✅ Success' : '❌ Failed\n');

        // Test 5: Volume control (optional - uncomment to test)
        /*
        console.log('5️⃣  Testing volume control...');
        console.log('   Setting volume to 30...');
        await client.setVolume(30);
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('   Volume up...');
        await client.volumePlus();
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('   Volume down...');
        await client.volumeMinus();
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('   ✅ Volume control working\n');
        */

        // Test 6: Keep connection open for state updates (WebSocket)
        if (apiMode === 'websocket') {
            console.log('6️⃣  Listening for state updates (30 seconds)...');
            console.log('   (Play/pause/skip on Volumio to see updates)\n');
            await new Promise(resolve => setTimeout(resolve, 30000));
        } else {
            console.log('6️⃣  Monitoring state with polling (30 seconds)...');
            console.log('   (Play/pause/skip on Volumio to see updates)\n');
            await new Promise(resolve => setTimeout(resolve, 30000));
        }

        // Cleanup
        console.log('\n🧹 Disconnecting...');
        await client.disconnect();
        console.log('✅ Test completed successfully!\n');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Run test
testClient().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});
