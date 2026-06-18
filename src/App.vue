<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import LobbyView from './components/lobby/LobbyView.vue'
import PhaserChessGame from './components/chess/PhaserChessGame.vue'
import UserSettingsModal from './components/identity/UserSettingsModal.vue'
import PeerRatingModal from './components/identity/PeerRatingModal.vue'
import { computeDerivedRating } from './utils/rating'
import { t, lang, toggleLang } from './i18n'
import { useBackLayer } from '@dotrino/nav/vue'
import '@dotrino/share'
import { startAppTutorial } from './lib/tutorial'
import { useGameStore } from './stores/gameStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { useHostGameStore } from '@/stores/hostGameStore'
import { usePlayerGameStore } from '@/stores/playerGameStore'

// Stores
const gameStore = useGameStore()
const connectionStore = useConnectionStore()
const hostGameStore = useHostGameStore()
const playerGameStore = usePlayerGameStore()

// Estado local
const showGameControls = ref(true)
const boardSize = ref(computeBoardSize())
const currentView = ref('lobby') // 'lobby', 'game'
const isConnecting = ref(false)

function computeBoardSize () {
  if (typeof window === 'undefined') return 600
  // En móvil: ancho de pantalla menos 24px de padding total. En desktop: tope 600px.
  return Math.min(window.innerWidth - 24, 600)
}

const onResize = () => { boardSize.value = computeBoardSize() }

// Identity / rating UI
const settingsOpen = ref(false)
const ratingTarget = ref(null)

// Compartir partida: link directo (#table=<token>) + QR + redes, vía el Web
// Component compartido del ecosistema. El link abre la partida al cargar.
const shareOpen = ref(false)
const shareUrl = computed(() => {
  const tk = connectionStore.token
  return tk ? `${location.origin}${location.pathname}#table=${encodeURIComponent(tk)}` : ''
})
const shareTheme = {
  '--ccs-bg': 'var(--color-card-bg, #1c1c1e)', '--ccs-text': 'var(--color-text, #f2f2f2)',
  '--ccs-muted': 'var(--color-text-secondary, #9a9a9a)', '--ccs-border': 'var(--color-border, rgba(255,255,255,.12))',
  '--ccs-accent': 'var(--color-primary, #cda350)', '--ccs-accent-text': '#1c1c1e',
  '--ccs-input-bg': 'var(--color-background, #111)'
}

// Volver unificado (@dotrino/nav): el botón físico / chevron
// cierra el modal abierto, o vuelve del tablero al lobby, antes de salir a
// dotrino.com. El juego es una "vista" sobre el lobby.
useBackLayer(settingsOpen)
useBackLayer(ratingTarget, { onClose: () => { ratingTarget.value = null } })
const gameOpen = computed(() => currentView.value === 'game')
useBackLayer(gameOpen, { onClose: () => { currentView.value = 'lobby' } })

const opponentToken = computed(() => {
  if (connectionStore.isGuest) return connectionStore.subscribedHost
  if (connectionStore.isHost && connectionStore.subscribers.length > 0) return connectionStore.subscribers[0]
  return null
})
const opponentInfo = computed(() => {
  const t = opponentToken.value
  if (!t) return null
  const id = connectionStore.peerIdentities.get(t)
  return {
    token: t,
    pubkey: id?.pubkey || null,
    peer: id?.peer || null,
    announcedNickname: id?.announcedNickname || null
  }
})
const opponentRating = computed(() => {
  return computeDerivedRating(opponentInfo.value?.peer, connectionStore.trustMap)
})

const openOpponentRating = () => {
  if (!opponentInfo.value) return
  ratingTarget.value = opponentInfo.value
}

// "Mi perfil": botón del header (a la izquierda de la moneda de soporte) que abre
// el MISMO Web Component compartido en modo self con mi identidad del vault.
const myProfilePk = ref(null)
async function openMyProfile () {
  await connectionStore.refreshIdentity?.()
  const pk = connectionStore.myPubkey
  if (pk) myProfilePk.value = pk
}
function bindMyProfile (el) {
  if (!el) return
  connectionStore.getProfileProvider().then((p) => { if (p) el.provider = p })
}
useBackLayer(myProfilePk, { onClose: () => { myProfilePk.value = null } })
const profileTheme = {
  '--ccp-bg': 'var(--color-card-bg)', '--ccp-bg-2': 'var(--color-surface)',
  '--ccp-bg-3': 'var(--color-surface-variant)', '--ccp-bg-4': 'var(--color-border-light)',
  '--ccp-border': 'var(--color-border)', '--ccp-text': 'var(--color-text)',
  '--ccp-muted': 'var(--color-text-secondary)', '--ccp-accent': 'var(--color-primary)',
  '--ccp-accent-2': 'var(--color-primary-dark)', '--ccp-derived': '#d49a00', '--ccp-gold': '#f5b301',
  '--ccp-online': 'var(--color-success)', '--ccp-affinity': 'var(--color-secondary)',
  '--ccp-input-bg': 'var(--color-background)', '--ccp-radius': '10px',
}

onMounted(() => {
  connectionStore.refreshIdentity?.()
  window.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', onResize)

  // API global para tests automatizados (Playwright). Permite interactuar con
  // el juego sin depender de coordenadas del canvas Phaser.
  window.__chess = {
    stores: {
      connection: connectionStore,
      game: gameStore,
      host: hostGameStore,
      player: playerGameStore
    },
    createServer(isPrivate = false) {
      connectionStore.setMode('host', isPrivate ? 'private' : 'public')
      return connectionStore.token
    },
    async joinServer(hostToken) {
      connectionStore.setMode('guest')
      return connectionStore.subscribeToHost(hostToken)
    },
    occupy(color) {
      if (connectionStore.isHost) return hostGameStore.occupySeatAsHost(color)
      return playerGameStore.requestSeat(color)
    },
    leaveSeat() {
      if (connectionStore.isHost) return hostGameStore.leaveSeatAsHost()
      return playerGameStore.requestLeaveSeat()
    },
    move(fromRow, fromCol, toRow, toCol) {
      if (connectionStore.isHost) {
        hostGameStore.selectPieceAsHost({ row: fromRow, col: fromCol })
        return hostGameStore.makeMoveAsHost({ row: toRow, col: toCol })
      } else {
        playerGameStore.selectPiece({ row: fromRow, col: fromCol })
        return playerGameStore.makeMove({ row: toRow, col: toCol })
      }
    },
    getBoard() {
      const store = connectionStore.isHost ? hostGameStore : playerGameStore
      return store.board.map(r => r.map(c => c || '.').join(''))
    },
    getSeats() {
      const store = connectionStore.isHost ? hostGameStore : playerGameStore
      return JSON.parse(JSON.stringify(store.seats))
    },
    getTurn() { return gameStore.currentTurn },
    getStatus() { return gameStore.gameStatus },
    getMyToken() { return connectionStore.token },
    getOpponentToken() { return opponentToken.value },
    surrender() {
      return playerGameStore.surrender ? playerGameStore.surrender() : null
    }
  }
})

// Computed
const gameTitle = computed(() => {
  if (gameStore.gameStatus === 'playing') {
    return `Ajedrez - Turno: ${gameStore.currentTurn === 'white' ? 'Blancas' : 'Negras'}`
  }
  
  switch (currentView.value) {
    case 'lobby':
      if (!connectionStore.isConnected) {
        return 'Lobby de Ajedrez - Conectando...'
      }
      return 'Lobby de Ajedrez'
    case 'game':
      if (gameStore.gameStatus === 'paused') {
        return 'Ajedrez - Juego en pausa'
      }
      return 'Ajedrez - Configurando asientos'
    default:
      return 'Ajedrez con WebSocket'
  }
})

const playerInfo = computed(() => {
  if (gameStore.gameStatus === 'playing') {
    return `Eres las ${gameStore.playerColor === 'white' ? 'blancas' : 'negras'} ${gameStore.isHost ? '(Host)' : '(Guest)'}`
  }
  
  switch (currentView.value) {
    case 'lobby':
      if (!connectionStore.isConnected) {
        return 'Conectando al servidor...'
      }
      return 'Selecciona o crea un juego para comenzar'
    case 'game':
      if (gameStore.isSeated) {
        return `Jugador (${gameStore.mySeatColor === 'white' ? 'Blancas' : 'Negras'})`
      } else if (gameStore.isSpectator) {
        return `Espectador (${gameStore.spectatorsCount} total)`
      } else {
        return 'Selecciona un asiento para jugar'
      }
    default:
      return 'Conectando al servidor...'
  }
})

const canShowGame = computed(() => {
  // Siempre mostrar el juego cuando estamos en la vista de juego
  // El overlay de selección de asientos manejará la interacción
  return currentView.value === 'game'
})

// Determinar vista actual basada en estado
const determineCurrentView = () => {
  if (!connectionStore.isConnected) {
    currentView.value = 'lobby'
    return
  }

  // Si está conectado pero no tiene modo (no es host ni guest), mostrar lobby
  if (!connectionStore.mode) {
    currentView.value = 'lobby'
    return
  }

  // Si es host o guest, ir al juego (tablero con selección de asientos)
  // El sistema de asientos manejará si el usuario es jugador o espectador
  currentView.value = 'game'
}

// Conectar automáticamente al WebSocket proxy
const autoConnect = async () => {
  if (connectionStore.isConnected || isConnecting.value) {
    return
  }
  
  isConnecting.value = true
  try {
    console.log('Conectando automáticamente al servidor WebSocket proxy...')
    await connectionStore.connect()
    console.log('Conexión WebSocket proxy establecida automáticamente')
  } catch (error) {
    console.error('Error al conectar automáticamente:', error)
    // El connectionStore manejará la reconexión automática
  } finally {
    isConnecting.value = false
  }
}

// Watchers para cambios de estado
watch(() => connectionStore.isConnected, determineCurrentView)
watch(() => connectionStore.mode, determineCurrentView)
watch(() => gameStore.gameStatus, determineCurrentView)

// Inicializar vista
determineCurrentView()

// Configurar listeners para eventos del proxy (a través del connectionStore)
// Los eventos se manejan internamente en el connectionStore
// Para cambios de vista, usamos watchers en el estado del store

// Método para volver al lobby
const returnToLobby = async () => {
  try {
    // Si somos host, destruir la instancia del host primero
    if (connectionStore.isHost) {
      hostGameStore.destroyHostInstance()
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    // Si estamos suscritos como guest, desuscribirse y resetear estado local
    if (connectionStore.isGuest && connectionStore.subscribedHost) {
      await connectionStore.unsubscribe()
    }
    
    // Resetear estado del juego del guest (seats, playerColor, board, etc.)
    if (connectionStore.isGuest) {
      playerGameStore.resetLocalGame()
    }
    
    // Actualizar estado de conexión
    connectionStore.setMode(null)
    connectionStore.setSubscribedHost(null)
    currentView.value = 'lobby'
  } catch (error) {
    console.error('Error al volver al lobby:', error)
    playerGameStore.resetLocalGame()
    connectionStore.setMode(null)
    connectionStore.setSubscribedHost(null)
    currentView.value = 'lobby'
  }
}

const joinPublicGame = async (hostToken) => {
  try {
    connectionStore.setMode('guest')
    const success = await connectionStore.subscribeToHost(hostToken)
    if (success) {
      // Solicitar el estado completo directamente — sin watch, sin delay de tick
      playerGameStore.requestFullState(hostToken)
    } else {
      connectionStore.setMode(null)
    }
  } catch (error) {
    console.error('Error al unirse al juego:', error)
    connectionStore.setMode(null)
  }
}

// ── Nickname requerido (gate al inicio + por acción) ──────────────
const nickDraft = ref('')
const nickInput = ref(null)
const submitNickname = async () => {
  const ok = await connectionStore.submitNick(nickDraft.value)
  if (ok) nickDraft.value = ''
}
watch(() => connectionStore.nickModalOpen, (open) => {
  if (open) setTimeout(() => { try { nickInput.value?.focus() } catch (_) {} }, 50)
})

const statusLabel = (s) => t.value.status[s] || s
const colorName = (c) => (c === 'white' ? t.value.white : t.value.black)

// Conectar automáticamente al montar el componente. Pedimos el nick recién
// después de conectar+hidratar identidad (el vault puede traer un nick guardado).
onMounted(async () => {
  // Capturamos el hash ANTES de conectar: el lobby limpia el #table= entrante al
  // conectar, y el tutorial necesita saber si la visita fue "limpia".
  const frag = (location.hash || '').replace(/^#/, '')
  await autoConnect()
  try { await connectionStore.refreshIdentity?.() } catch (_) {}
  if (!connectionStore.hasNick) connectionStore.requireNick(null)
  // Tutorial guiado (una sola vez por dispositivo). Solo en visita "limpia" (sin
  // enlace #table entrante), para no interrumpir a quien llega por un enlace.
  if (frag) return
  const launchTutorial = () => startAppTutorial({
    lang: () => lang.value,
    inGame: () => currentView.value === 'game',
    goLobby: () => { currentView.value = 'lobby' },
  })
  // En el primer arranque el modal de apodo (obligatorio) tapa el lobby: esperamos
  // a que se cierre y haya apodo antes de mostrar las burbujas.
  if (connectionStore.hasNick && !connectionStore.nickModalOpen) launchTutorial()
  else {
    const stop = watch(() => connectionStore.nickModalOpen, (open) => {
      if (!open && connectionStore.hasNick) { stop(); launchTutorial() }
    })
  }
})
</script>

<template>
  <div class="app">
    <header class="topbar">
      <dotrino-back class="cc-back"></dotrino-back>
      <div class="brand">
        <span class="brand-mark">♞</span>
        <div class="brand-text">
          <span class="brand-name">{{ t.brand }}</span>
          <span class="brand-sub">dotrino.com</span>
        </div>
      </div>

      <div class="hdr-actions">
        <button v-if="currentView !== 'lobby'" class="ghost-btn" @click="returnToLobby">← {{ t.lobby }}</button>

        <button v-if="opponentInfo" class="opp-chip" @click="openOpponentRating" :title="t.rateOpponent">
          <span class="opp-vs">vs</span>
          <span class="opp-name">{{ opponentInfo.peer?.nickname || opponentInfo.announcedNickname || '—' }}</span>
          <span v-if="opponentRating.value != null" class="rating-badge" :class="{ derived: opponentRating.source === 'derived' }">
            ★ {{ opponentRating.value.toFixed(opponentRating.source === 'derived' ? 1 : 0) }}
          </span>
        </button>

        <button class="me-chip" @click="settingsOpen = true" :title="t.identity">
          <span class="dot" :class="connectionStore.isConnected ? 'on' : 'off'"></span>
          <span class="me-name">@{{ connectionStore.myNickname || t.noName }}</span>
          <span v-if="connectionStore.myElo" class="elo-badge" title="ELO">{{ connectionStore.myElo.elo }}</span>
        </button>

        <button class="lang-btn" @click="toggleLang" :title="lang === 'es' ? 'English' : 'Español'">{{ lang === 'es' ? 'EN' : 'ES' }}</button>

        <button class="profile-btn" data-testid="my-profile" @click="openMyProfile" :title="t.identity" aria-label="Mi perfil">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
          </svg>
        </button>

        <dotrino-support class="hdr-coin" :lang="lang" href="https://ko-fi.com/dotrino" repo="imdotrino/dotrino-chess" discord="https://discord.gg/D648uq7cth"></dotrino-support>
      </div>
    </header>

    <div v-if="connectionStore.nickModalOpen" class="nick-overlay">
      <div class="nick-card">
        <div class="nick-mark">♚</div>
        <h2>{{ t.nickTitle }}</h2>
        <p class="nick-sub">{{ t.nickSub }}</p>
        <input ref="nickInput" v-model="nickDraft" maxlength="20" :placeholder="t.nickPlaceholder" @keyup.enter="submitNickname" />
        <div class="nick-row">
          <span class="nick-count">{{ nickDraft.trim().length }} / 20</span>
          <button class="primary" :disabled="nickDraft.trim().length < 2" @click="submitNickname">{{ t.nickEnter }}</button>
        </div>
      </div>
    </div>

    <UserSettingsModal :open="settingsOpen" @close="settingsOpen = false" />
    <PeerRatingModal :info="ratingTarget" @close="ratingTarget = null" />

    <!-- Compartir partida: Web Component compartido del ecosistema -->
    <dotrino-share
      :lang="lang"
      :style="shareTheme"
      :url="shareUrl"
      :text="t.shareTableText"
      :open="shareOpen"
      @cc-share-close="shareOpen = false"
    ></dotrino-share>

    <!-- Mi perfil (botón del header, a la izquierda de la moneda): mismo Web
         Component compartido en modo self con mi identidad del vault. -->
    <dotrino-profile
      v-if="myProfilePk"
      :ref="bindMyProfile"
      modal
      mode="self"
      indicators="elo:chess"
      :lang="lang"
      :style="profileTheme"
      :pubkey="myProfilePk"
      :name="connectionStore.myNickname || ''"
      @cc-profile-close="myProfilePk = null"
    ></dotrino-profile>

    <main class="main">
      <section v-if="currentView === 'lobby'" class="lobby-shell">
        <LobbyView />
      </section>

      <section v-else class="game-shell">
        <div class="board-wrap" :class="{ active: canShowGame }">
          <PhaserChessGame v-if="canShowGame" :board-size="boardSize" class="chess-game" @share="shareOpen = true" />
          <div v-else class="board-skeleton">
            <div class="mini-board">
              <div v-for="i in 64" :key="i" class="sq" :class="{ light: (Math.floor((i - 1) / 8) + ((i - 1) % 8)) % 2 === 0 }"></div>
            </div>
            <p>{{ t.waitingToStart }}</p>
          </div>
        </div>

        <aside class="side-panel">
          <div class="panel-card status-card">
            <div class="turn-line" v-if="gameStore.gameStatus !== 'waiting'">
              <span class="turn-dot" :class="gameStore.currentTurn"></span>
              <span class="turn-text">
                {{ t.toMove(colorName(gameStore.currentTurn)) }}<strong v-if="gameStore.isMyTurn"> {{ t.yourTurn }}</strong>
              </span>
            </div>
            <div class="state-pill" :data-state="gameStore.gameStatus">{{ statusLabel(gameStore.gameStatus) }}</div>
            <div v-if="gameStore.winner" class="winner-line">{{ t.win(colorName(gameStore.winner)) }}</div>
          </div>

          <div class="panel-card moves-card">
            <h4>{{ t.moves }}</h4>
            <ol class="moves">
              <li v-for="(m, i) in gameStore.moveHistory" :key="i">
                <span class="mv-n">{{ i + 1 }}</span><span class="mv-san">{{ m.notation || '—' }}</span>
              </li>
              <li v-if="!gameStore.moveHistory.length" class="moves-empty">{{ t.noMoves }}</li>
            </ol>
          </div>
        </aside>
      </section>
    </main>
  </div>
</template>

<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; }

/* ── Topbar ── */
.topbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 10px 18px; flex-wrap: wrap; row-gap: 8px;
  background: rgba(28, 23, 16, .82); backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--color-border);
}
.cc-back { color: var(--color-text-on-dark, #f8f9fa); --cc-back-size: 36px; margin-left: -2px; }
.brand { display: flex; align-items: center; gap: 11px; margin-right: auto; }
.brand-mark {
  width: 40px; height: 40px; display: grid; place-items: center;
  font-size: 24px; line-height: 1; color: #1a1408;
  background: linear-gradient(145deg, var(--color-primary-light), var(--color-primary-dark));
  border-radius: 12px; box-shadow: 0 4px 14px rgba(205,163,80,.3);
}
.brand-text { display: flex; flex-direction: column; line-height: 1.05; }
.brand-name { font-family: var(--font-headline); font-weight: 700; font-size: 18px; color: var(--color-text); }
.brand-sub { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--color-text-tertiary); }

.hdr-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
/* Móvil: la marca se queda en su fila; las acciones bajan a una 2ª fila a la
   derecha (convención §5 de CONVENCIONES-APPS.md). */
@media (max-width: 560px) {
  .hdr-actions { flex-basis: 100%; }
}
.ghost-btn { background: transparent; border: 1px solid var(--color-border); color: var(--color-text-secondary); padding: 7px 12px; border-radius: 999px; font-size: 13px; }
.ghost-btn:hover { color: var(--color-text); border-color: var(--color-border-dark); }
.lang-btn { background: var(--color-surface-variant); border: 1px solid var(--color-border); color: var(--color-text-secondary); padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: .03em; }
.lang-btn:hover { color: var(--color-text); border-color: var(--color-primary); }
/* "Mi perfil": botón circular ghost a la izquierda de la moneda de soporte. */
.profile-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; padding: 0; flex-shrink: 0;
  background: var(--color-surface-variant); border: 1px solid var(--color-border);
  color: var(--color-text-secondary); border-radius: 50%; cursor: pointer;
}
.profile-btn svg { width: 18px; height: 18px; display: block; }
.profile-btn:hover { color: var(--color-text); border-color: var(--color-primary); }
.elo-badge { background: var(--color-primary); color: #1a1408; border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 700; font-family: var(--font-mono); }

.me-chip, .opp-chip {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 12px; border-radius: 999px;
  background: var(--color-surface-variant); border: 1px solid var(--color-border);
  color: var(--color-text); font-size: 13px; font-weight: 600;
}
.me-chip:hover, .opp-chip:hover { border-color: var(--color-primary); transform: translateY(-1px); }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot.on { background: var(--color-success); box-shadow: 0 0 0 3px rgba(122,166,79,.2); }
.dot.off { background: var(--color-error); opacity: .7; }
.opp-vs { color: var(--color-text-tertiary); font-weight: 700; font-size: 11px; }
.rating-badge { background: var(--color-primary); color: #1a1408; border-radius: 999px; padding: 1px 7px; font-size: 11px; font-weight: 700; }
.rating-badge.derived { background: transparent; color: var(--color-primary-light); border: 1px solid var(--color-primary); }
.hdr-coin { display: inline-flex; align-items: center; }

/* ── Nickname gate ── */
.nick-overlay {
  position: fixed; inset: 0; z-index: 60;
  display: grid; place-items: center; padding: 24px;
  background: rgba(10, 8, 5, .72); backdrop-filter: blur(6px);
}
.nick-card {
  width: 100%; max-width: 420px; text-align: center;
  background: var(--color-card-bg); border: 1px solid var(--color-border);
  border-radius: 20px; padding: 36px 32px; box-shadow: var(--shadow-lg);
  animation: pop .25s ease-out;
}
@keyframes pop { from { transform: translateY(10px) scale(.98); opacity: 0; } to { transform: none; opacity: 1; } }
.nick-mark {
  width: 64px; height: 64px; margin: 0 auto 18px; display: grid; place-items: center;
  font-size: 36px; color: #1a1408; border-radius: 16px;
  background: linear-gradient(145deg, var(--color-primary-light), var(--color-primary-dark));
  box-shadow: 0 6px 20px rgba(205,163,80,.35);
}
.nick-card h2 { font-size: 24px; margin-bottom: 8px; }
.nick-sub { color: var(--color-text-secondary); font-size: 14px; line-height: 1.55; margin: 0 0 20px; }
.nick-card input { width: 100%; text-align: center; font-size: 18px; padding: 13px; }
.nick-row { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; gap: 12px; }
.nick-count { font-size: 12px; color: var(--color-text-tertiary); font-family: var(--font-mono); }
.nick-row button { padding: 11px 22px; }

/* ── Main ── */
.main { flex: 1; padding: 24px 18px 48px; }
.lobby-shell { max-width: 860px; margin: 0 auto; }

/* ── Game ── */
.game-shell {
  max-width: 1100px; margin: 0 auto;
  display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 22px; align-items: start;
}
.board-wrap {
  display: grid; place-items: center; padding: 14px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 18px; box-shadow: var(--shadow-md);
}
.chess-game { border-radius: 10px; overflow: hidden; }
.board-skeleton { text-align: center; color: var(--color-text-secondary); padding: 20px; }
.board-skeleton p { margin-top: 16px; font-size: 14px; }
.mini-board {
  display: grid; grid-template-columns: repeat(8, 1fr); width: 280px; height: 280px;
  margin: 0 auto; border-radius: 10px; overflow: hidden; box-shadow: var(--shadow-md);
  opacity: .5;
}
.mini-board .sq { background: var(--board-dark); }
.mini-board .sq.light { background: var(--board-light); }

.side-panel { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 80px; }
.panel-card { background: var(--color-card-bg); border: 1px solid var(--color-border); border-radius: 16px; padding: 16px 18px; }
.turn-line { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.turn-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--color-border-dark); }
.turn-dot.white { background: #f3efe3; }
.turn-dot.black { background: #211a12; }
.turn-text { font-size: 14px; color: var(--color-text-secondary); }
.turn-text strong { color: var(--color-primary-light); }
.state-pill {
  display: inline-block; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 700;
  background: var(--color-surface-variant); color: var(--color-text-secondary); border: 1px solid var(--color-border);
}
.state-pill[data-state="playing"], .state-pill[data-state="check"] { background: rgba(122,166,79,.18); color: var(--color-success-light); border-color: transparent; }
.state-pill[data-state="check"] { background: rgba(214,162,58,.18); color: var(--color-warning-light); }
.state-pill[data-state="checkmate"], .state-pill[data-state="finished"] { background: rgba(199,92,77,.18); color: var(--color-error-light); border-color: transparent; }
.winner-line { margin-top: 12px; font-weight: 700; color: var(--color-primary-light); }

.moves-card h4 { font-size: 12px; text-transform: uppercase; letter-spacing: .1em; color: var(--color-text-tertiary); margin-bottom: 10px; }
.moves { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow-y: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.moves li { display: flex; align-items: baseline; gap: 8px; padding: 4px 8px; border-radius: 8px; background: var(--color-surface); font-size: 13px; }
.mv-n { color: var(--color-text-tertiary); font-family: var(--font-mono); font-size: 11px; min-width: 18px; }
.mv-san { font-family: var(--font-mono); color: var(--color-text); }
.moves-empty { grid-column: 1 / -1; color: var(--color-text-tertiary); background: transparent; font-style: italic; }

@media (max-width: 860px) {
  .game-shell { grid-template-columns: 1fr; }
  .side-panel { position: static; flex-direction: row; flex-wrap: wrap; }
  .panel-card { flex: 1; min-width: 220px; }
  .brand-sub { display: none; }
}
</style>
