# ioBroker.volumio Test Guide

## Voraussetzungen
- ioBroker-Installation (lokal oder in VM)
- Volumio-Installation (erreichbar im Netzwerk)
- Adapter gebaut (`npm run build`)

## Test-Szenarien

### 1. WebSocket-Modus Test

**Setup:**
- API Mode: WebSocket
- Host: volumio.local (oder deine IP)
- Reconnection attempts: 5
- Reconnection delay: 2

**Tests:**

#### Test 1.1: Verbindung
```
✅ Erwartung:
  - State "info.connection" wird auf true gesetzt
  - Log zeigt: "Successfully connected to Volumio"
  - Log zeigt: "Connection to Volumio established"

❌ Fehler wenn:
  - State bleibt false
  - Log zeigt Connection-Fehler
```

#### Test 1.2: Real-time State Updates
```
Aktion: Musik auf Volumio abspielen (über Volumio UI)

✅ Erwartung:
  - State "playbackInfo.status" ändert sich zu "play"
  - State "playbackInfo.title" zeigt Songtitel
  - State "playbackInfo.artist" zeigt Künstler
  - Updates kommen sofort (< 1 Sekunde)

❌ Fehler wenn:
  - States ändern sich nicht
  - Updates kommen mit großer Verzögerung
```

#### Test 1.3: Playback Control
```
Aktion: State "player.pause" auf true setzen

✅ Erwartung:
  - Volumio pausiert die Wiedergabe
  - State "playbackInfo.status" ändert sich zu "pause"
  - Log zeigt: "Playback paused"

Weitere Tests:
  - player.play → Wiedergabe startet
  - player.next → Nächster Track
  - player.prev → Vorheriger Track
  - player.stop → Wiedergabe stoppt
```

#### Test 1.4: Volume Control
```
Aktion: State "player.volume" auf 50 setzen

✅ Erwartung:
  - Volumio-Lautstärke ändert sich auf 50%
  - State "playbackInfo.volume" zeigt 50
  - Log zeigt: "Volume set to 50"

Weitere Tests:
  - player.volume.up → Lautstärke erhöht sich
  - player.volume.down → Lautstärke verringert sich
  - player.mute → Ton stumm
  - player.unmute → Ton wieder an
```

#### Test 1.5: Verbindungsabbruch und Reconnect
```
Aktion: Volumio beenden oder Netzwerk trennen

✅ Erwartung:
  - State "info.connection" wird false
  - Log zeigt: "Connection to Volumio lost"
  - Nach Neustart von Volumio: Automatischer Reconnect
  - Log zeigt: "Connection to Volumio established"
```

### 2. REST-Modus Test

**Setup:**
- API Mode: REST API
- Host: volumio.local
- Poll interval: 2 seconds

**Tests:**

#### Test 2.1: Verbindung & Polling
```
✅ Erwartung:
  - State "info.connection" wird auf true gesetzt
  - Log zeigt regelmäßige State-Updates (alle 2 Sekunden)
  - States werden aktualisiert (mit leichter Verzögerung)

❌ Fehler wenn:
  - Keine regelmäßigen Updates
  - States bleiben statisch
```

#### Test 2.2: Playback Control
```
(Gleiche Tests wie WebSocket-Modus)
Unterschied: States aktualisieren sich erst nach nächstem Poll (bis zu 2 Sek. Verzögerung)
```

#### Test 2.3: Poll Interval ändern
```
Aktion: Poll interval auf 5 Sekunden ändern

✅ Erwartung:
  - Updates kommen jetzt alle 5 Sekunden
  - Keine häufigeren Requests an Volumio
```

### 3. Adapter Lifecycle Tests

#### Test 3.1: Adapter Start
```
Aktion: Adapter-Instanz starten

✅ Erwartung:
  - Log zeigt Client-Initialisierung
  - Verbindung wird aufgebaut
  - System-Info wird geholt
  - Initial State wird geholt
```

#### Test 3.2: Adapter Stop
```
Aktion: Adapter-Instanz stoppen

✅ Erwartung:
  - Log zeigt Client-Disconnect
  - Keine weiteren API-Calls
  - Sauberer Shutdown ohne Errors
```

#### Test 3.3: Adapter Neustart
```
Aktion: Adapter-Instanz neu starten

✅ Erwartung:
  - Alter Client wird getrennt
  - Neuer Client wird initialisiert
  - Verbindung wird neu aufgebaut
```

### 4. Konfigurationswechsel Test

#### Test 4.1: WebSocket → REST Wechsel
```
Aktion: API Mode von WebSocket auf REST ändern, Adapter neu starten

✅ Erwartung:
  - WebSocket-Verbindung wird getrennt
  - REST-Client wird initialisiert
  - Polling startet
  - Alle Funktionen arbeiten weiterhin
```

#### Test 4.2: REST → WebSocket Wechsel
```
Aktion: API Mode von REST auf WebSocket ändern, Adapter neu starten

✅ Erwartung:
  - Polling stoppt
  - WebSocket-Verbindung wird aufgebaut
  - Real-time Updates starten
  - Alle Funktionen arbeiten weiterhin
```

### 5. Error Handling Tests

#### Test 5.1: Falscher Hostname
```
Setup: Host auf "invalid.host" setzen

✅ Erwartung:
  - State "info.connection" bleibt false
  - Log zeigt Verbindungsfehler
  - Keine Crashes
```

#### Test 5.2: Volumio nicht erreichbar
```
Aktion: Volumio während Betrieb herunterfahren

✅ Erwartung (WebSocket):
  - Connection Lost Event
  - State "info.connection" → false
  - Reconnect-Versuche (5x mit 2 Sek. Pause)
  - Nach 5 Versuchen: Aufgeben

✅ Erwartung (REST):
  - Ping-Fehler bei jedem Poll
  - State "info.connection" → false
  - Weiterhin Polling-Versuche
```

### 6. Queue & Playback Options Tests

#### Test 6.1: Queue Management
```
Aktion: State "queue.clearQueue" auf true setzen

✅ Erwartung:
  - Volumio-Queue wird geleert
  - Log zeigt: "Queue cleared"
```

#### Test 6.2: Random Playback
```
Aktion: State "queue.random" auf true setzen

✅ Erwartung:
  - Random Mode aktiviert
  - State "playbackInfo.random" wird true
  - State "queue.shuffleMode" wird 1
```

#### Test 6.3: Repeat Track
```
Aktion: State "queue.repeatTrackState" auf true setzen

✅ Erwartung:
  - Repeat Single aktiviert
  - State "playbackInfo.repeatSingle" wird true
```

## Logs überwachen

Wichtige Log-Meldungen:

**Erfolgreiche Verbindung:**
```
volumio.0 | info | Connecting to Volumio ...
volumio.0 | info | Successfully connected to Volumio
volumio.0 | info | Connection to Volumio established
```

**State Changes (WebSocket):**
```
volumio.0 | debug | State change received: {"status":"play","title":"..."}
```

**State Updates (REST):**
```
volumio.0 | debug | getState response: {"status":"play",...}
```

**Fehler:**
```
volumio.0 | error | Failed to connect to Volumio: ...
volumio.0 | error | Connection to Volumio lost
```

## Troubleshooting

### Problem: Keine Verbindung
- Prüfe ob Volumio erreichbar ist: `ping volumio.local`
- Prüfe Port 3000: `curl http://volumio.local:3000/api/v1/getState`
- Prüfe Adapter-Logs auf Fehler

### Problem: WebSocket verbindet nicht
- Prüfe ob Socket.IO erreichbar: `curl http://volumio.local:3000/socket.io/`
- Prüfe Firewall-Einstellungen
- Teste REST-Modus als Alternative

### Problem: States aktualisieren nicht
- REST: Prüfe Poll-Interval Einstellung
- WebSocket: Prüfe ob pushState Events ankommen (Debug-Log)
- Prüfe ob Volumio selbst läuft und State ändert

### Problem: Commands funktionieren nicht
- Prüfe ob State ACK=false gesetzt wird (nicht ACK=true)
- Prüfe Adapter-Logs auf Fehler bei Command-Ausführung
- Teste gleiche Commands direkt an Volumio API
