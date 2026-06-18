# Migración del ajedrez a `@dotrino/lobby`

El ajedrez es el primer juego en estrenar la librería común de **lobby +
matchmaking** del ecosistema. Toda la fontanería de salas/asientos/espectadores/
presencia/sincronización/reconexión que el ajedrez tenía a mano ahora vive en el
paquete compartido (`@dotrino/lobby`, publicado en npm). En la
app queda **sólo la UI + las reglas** (`chessRules`), envueltas en un adapter.

> **Estado:** rewire de stores COMPLETO. `vite build` pasa y se cruzó cada símbolo
> que los componentes consumen contra los shims (0 faltantes). **Pendiente: E2E en
> navegador** (Playwright, 2 identidades) — único paso que no se puede correr
> headless porque necesita vault + proxy.

## Arquitectura

Una **fuente única de verdad** sobre la lib, y los 4 stores viejos reescritos como
**shims** que delegan en ella → los componentes **no se tocaron**.

```
componentes (App.vue, PhaserChessGame, LobbyView, ...)  ← sin cambios
        │  usan los mismos useXStore() de siempre
        ▼
connectionStore / gameStore / hostGameStore / playerGameStore   ← shims finos
        │  delegan todo
        ▼
stores/lobbyController.js   ← createLobby + Room + identidad/reputación (reactivo)
        │
        ▼
@dotrino/lobby  +  game/chessAdapter.js (reglas → motor)
```

## Archivos

| Archivo | Rol |
|---|---|
| `src/game/chessAdapter.js` | `makeChessEngine(rules)` → `{initialState, reducer, view, isOver}`. **Puro y testeado** (`test/chessAdapter.test.js`). |
| `src/stores/lobbyController.js` | Singleton reactivo: `createLobby` + sala actual + identidad/reputación; expone toda la API que necesitan los shims. |
| `src/stores/connectionStore.js` | **Reescrito** como shim (conexión/lobby/identidad). |
| `src/stores/gameStore.js` | **Reescrito** como shim (API neutral de juego). |
| `src/stores/hostGameStore.js` | **Reescrito** como shim (alias `...AsHost`). |
| `src/stores/playerGameStore.js` | **Reescrito** como shim (alias `request*`/`*Local*`). |

Eliminado: `src/stores/lobbyGameStore.js` (lo reemplaza el controller).

## Qué quedó obsoleto dentro de `sharedGameLogic.js` (limpieza opcional)

`MESSAGE_TYPES`, `GAME_STATUS`, `formatWebSocketMessage`, `parseWebSocketMessage`,
`createVersion`, `createInitialGameState`, `createInitialSeats` — ya no se usan (el
protocolo casero + versioning lo reemplaza el paquete). **Conservar**
`getAlgebraicNotation`, `getValidMoves`, `isValidMoveForPlayer`, `COLORS` y los
re-exports de reglas (los usa el adapter/controller/UI).

## Cambios de comportamiento (transparentes para los componentes)

- **Identidad por pubkey del vault**, no por token efímero. El shim mantiene la API
  vieja: `seats.x.playerToken` ahora es la **pubkey**; `opponentToken` devuelve la
  pubkey del rival y `peerIdentities` está rekeyed por pubkey, así que
  `App.vue`/`PeerRatingModal` siguen funcionando sin cambios.
- **`roomId == token` del host** se mantiene (la lista del lobby = tokens de host).
  `setMode('host')` fija `roomId` con el token del transporte (sincrónico) y crea la
  sala en segundo plano; `subscribeToHost(hostToken)` = `joinRoom`.
- **Gratis** con el lobby: reconexión por pubkey (asiento + host vía HOST_REKEY),
  verificación del oponente, gate de reputación, recibo de partida co-firmado.

## Verificación

- ✅ `npm run build` (Vite) — 61 módulos, la lib se bundlea en `dist/` (sin CDN).
- ✅ `node --test test/chessAdapter.test.js` — reglas reales (fool's mate, turno,
  legalidad, resign).
- ✅ Cross-check estático: todos los `store.X` de los componentes existen en los shims.
- ⏳ **E2E (obligatorio antes de borrar `sharedGameLogic` legacy):** con los 2 MCP de
  Playwright (perfiles separados = 2 identidades del vault), data-testid estables:
  1. Identidad A crea sala (`window.__chess.createServer()`), B lista y se une
     (`joinServer(roomId)`), o ambas `quickMatch`.
  2. Sentarse en blancas/negras → arranque automático (ambos asientos).
  3. Varias jugadas → tablero/relojes sincronizados en ambas.
  4. Cortar el WS de B y reconectar → recupera asiento, sigue (pausa→play).
  5. Jaque mate / tablas / `surrender()` → `gameStatus` y `winner` correctos.
  6. Espectador C ve la partida y no puede mover.
  7. Al terminar, calificar al oponente (contacto + atestación con recibo).

## Notas para el E2E

- `window.__chess` sigue expuesto (createServer/joinServer/occupy/move/getBoard/…).
  Tras `createServer()`, `getMyToken()` ya devuelve el `roomId` (token del host).
- Si un click de asiento llega en el instante entre `setMode('host')` y que la sala
  termine de crearse, se ignora (la creación tarda ms); reintentar el click.
