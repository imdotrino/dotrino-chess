<template>
  <div class="lobby">
    <!-- Crear partida -->
    <section class="create card">
      <div class="create-head">
        <h2>{{ t.playTitle }}</h2>
        <p>{{ t.playSub }}</p>
      </div>
      <div class="create-row">
        <div class="vis-toggle" role="tablist" data-testid="vis-toggle">
          <button :class="{ on: !isPrivate }" @click="isPrivate = false">🌐 {{ t.public }}</button>
          <button :class="{ on: isPrivate }" @click="isPrivate = true">🔒 {{ t.private }}</button>
        </div>
        <button class="primary create-btn" @click="createGame" data-testid="create-game">{{ t.createGame }}</button>
      </div>
      <div class="manual">
        <input v-model="manualToken" :placeholder="t.codePlaceholder" @keyup.enter="joinManual" data-testid="join-code" />
        <button @click="joinManual" :disabled="manualToken.trim().length < 3">{{ t.join }}</button>
      </div>
      <p v-if="errorMessage" class="err">{{ errorMessage }} <button class="link" @click="errorMessage = ''">✕</button></p>
    </section>

    <!-- Mesas públicas -->
    <section class="rooms" data-testid="public-tables">
      <header class="rooms-head">
        <div class="rooms-title">
          <h3>{{ t.publicTables }}</h3>
          <span class="count">{{ rooms.length }}</span>
        </div>
        <div class="rooms-tools">
          <label class="open-filter" :class="{ on: onlyOpen }">
            <input type="checkbox" v-model="onlyOpen" />
            {{ t.openOnly }}<span v-if="openCount"> ({{ openCount }})</span>
          </label>
          <span class="conn"><span class="dot" :class="connectionStore.isConnected ? 'on' : 'off'"></span>{{ connectionStore.isConnected ? t.online : t.connecting }}</span>
        </div>
      </header>

      <div v-if="!rooms.length" class="empty">
        <div class="empty-mark">♟</div>
        <p>{{ onlyOpen ? t.emptyOpen : t.emptyAll }}</p>
        <p class="empty-sub">{{ t.emptySub }}</p>
      </div>

      <ul v-else class="room-list">
        <li v-for="r in rooms" :key="r.roomId" class="room" :class="{ contact: r.isContact, full: !openSeats(r) }">
          <div class="host">
            <span class="avatar" :class="{ contact: r.isContact }">{{ hostInitials(r) }}</span>
            <div class="host-meta">
              <span class="host-name">
                {{ hostLabel(r) }}
                <span v-if="r.isContact" class="tag friend">{{ t.friend }}</span>
              </span>
              <span class="host-rep">
                <span v-if="r.hostElo" class="elo-mini">ELO {{ r.hostElo }}</span>
                <template v-if="(r.hostScore || 0) > 0"> · ★ {{ (r.hostScore * 5).toFixed(1) }} {{ t.reputation }}</template>
                <template v-else-if="!r.hostElo">{{ t.newPlayer }}</template>
              </span>
              <span v-if="otherSeated(r)" class="host-seated">vs {{ otherSeated(r) }}</span>
            </div>
          </div>

          <div class="room-stats">
            <span class="stat" :class="statusClass(r)">{{ statusText(r) }}</span>
            <span class="stat ghost" :title="t.spectators">👁 {{ r.spectators || 0 }}</span>
          </div>

          <button class="join" :class="{ primary: openSeats(r) }" :disabled="!canJoin(r)" @click="joinGame(r.roomId)">
            {{ openSeats(r) ? t.join : t.watch }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useConnectionStore } from '@/stores/connectionStore'
import { t } from '@/i18n'

const connectionStore = useConnectionStore()

const isPrivate = ref(false)
const manualToken = ref('')
const onlyOpen = ref(false)
const errorMessage = ref('')
let refreshInterval = null

const openSeats = (r) => r.status === 'waiting' && (r.openSeats || 0) > 0

const rooms = computed(() => {
  let list = connectionStore.publicRooms || []
  if (onlyOpen.value) list = list.filter(openSeats)
  // Orden: amigos primero → con lugar primero → más reputación.
  return [...list].sort((a, b) => {
    if (!!b.isContact !== !!a.isContact) return b.isContact ? 1 : -1
    const ao = openSeats(a) ? 1 : 0, bo = openSeats(b) ? 1 : 0
    if (bo !== ao) return bo - ao
    return (b.hostScore || 0) - (a.hostScore || 0)
  })
})
const openCount = computed(() => (connectionStore.publicRooms || []).filter(openSeats).length)

// Nombre visible del anfitrión. El resumen de la sala trae `hostName`, pero las
// mesas de bots a veces llegan sin él (resúmenes viejos de la flota): caemos al
// nombre del primer asiento ocupado para que el bot se vea, en vez de quedar
// como un "host" anónimo. Mismo arreglo que el lobby de Cuarenta.
const occupiedNames = (r) => (r.seats || []).filter(s => s.status === 'occupied' && s.name).map(s => s.name)
const hostName = (r) => r.hostName || occupiedNames(r)[0] || ''
// Rivales ya sentados además del anfitrión (p. ej. una mesa de bot vs bot).
const otherSeated = (r) => occupiedNames(r).filter(n => n !== hostName(r)).join(' · ')
const hostLabel = (r) => hostName(r) || (r.isContact ? t.value.yourContact : t.value.host)
const hostInitials = (r) => {
  const n = hostName(r)
  return n ? n.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '♟' : '♟'
}
const statusText = (r) => {
  if (r.status === 'playing') return t.value.status.playing
  if (r.status === 'paused') return t.value.status.paused
  if (r.status === 'ended') return t.value.status.finished
  const n = r.openSeats || 0
  return n > 0 ? t.value.seatsFree(n) : t.value.full
}
const statusClass = (r) => (openSeats(r) ? 'open' : (r.status === 'playing' ? 'playing' : 'busy'))
const canJoin = (r) => r.status !== 'ended'

const createGame = () => connectionStore.requireNick(() => {
  errorMessage.value = ''
  connectionStore.setMode('host', isPrivate.value ? 'private' : 'public')
})
const joinGame = (roomId) => connectionStore.requireNick(async () => {
  errorMessage.value = ''
  connectionStore.setMode('guest')
  const ok = await connectionStore.subscribeToHost(roomId)
  if (!ok) { errorMessage.value = t.value.errJoin; connectionStore.setMode(null) }
})
const joinManual = () => {
  const code = manualToken.value.trim()
  if (code.length < 3) { errorMessage.value = t.value.errCode; return }
  joinGame(code)
}

const refresh = () => { if (connectionStore.isConnected) connectionStore.listPublicHosts() }

onMounted(() => {
  if (connectionStore.isConnected) refresh()
  const ms = parseInt(import.meta.env.VITE_WS_LOBBY_REFRESH_INTERVAL) || 5000
  refreshInterval = setInterval(refresh, ms)
})
onUnmounted(() => { if (refreshInterval) clearInterval(refreshInterval) })
watch(() => connectionStore.isConnected, (c) => { if (c) refresh() })
</script>

<style scoped>
.lobby { display: flex; flex-direction: column; gap: 22px; }

/* Crear */
.create { padding: 24px; }
.create-head h2 { font-size: 24px; margin-bottom: 4px; }
.create-head p { color: var(--color-text-secondary); font-size: 14px; margin: 0 0 18px; }
.create-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.vis-toggle { display: inline-flex; background: var(--color-surface-variant); border: 1px solid var(--color-border); border-radius: 999px; padding: 3px; }
.vis-toggle button { border: none; background: transparent; color: var(--color-text-secondary); border-radius: 999px; padding: 8px 16px; font-size: 13px; }
.vis-toggle button.on { background: var(--color-primary); color: #1a1408; box-shadow: 0 2px 8px rgba(205,163,80,.3); }
.create-btn { margin-left: auto; padding: 11px 22px; font-size: 15px; }
.manual { display: flex; gap: 10px; margin-top: 16px; }
.manual input { flex: 1; }
.err { color: var(--color-error-light); font-size: 13px; margin: 12px 0 0; }
.link { background: none; border: none; color: inherit; padding: 0 4px; cursor: pointer; }

/* Mesas */
.rooms-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
.rooms-title { display: flex; align-items: baseline; gap: 10px; }
.rooms-title h3 { font-size: 18px; }
.count { font-family: var(--font-mono); font-size: 13px; color: var(--color-primary-light); background: var(--color-surface-variant); border-radius: 999px; padding: 2px 10px; }
.rooms-tools { display: flex; align-items: center; gap: 14px; }
.open-filter { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: var(--color-text-secondary); cursor: pointer; user-select: none; }
.open-filter.on { color: var(--color-primary-light); }
.open-filter input { width: 15px; height: 15px; accent-color: var(--color-primary); }
.conn { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--color-text-tertiary); }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.on { background: var(--color-success); box-shadow: 0 0 0 3px rgba(122,166,79,.18); }
.dot.off { background: var(--color-warning); }

.empty { text-align: center; padding: 48px 24px; color: var(--color-text-secondary); border: 1px dashed var(--color-border); border-radius: 16px; background: var(--color-surface); }
.empty-mark { font-size: 48px; opacity: .25; margin-bottom: 8px; }
.empty-sub { font-size: 13px; color: var(--color-text-tertiary); margin-top: 4px; }

.room-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.room {
  display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 14px;
  padding: 14px 16px; background: var(--color-card-bg);
  border: 1px solid var(--color-border); border-radius: 14px;
  transition: border-color .15s ease, transform .12s ease, box-shadow .15s ease;
}
.room:hover { border-color: var(--color-border-dark); transform: translateY(-1px); box-shadow: var(--shadow-sm); }
.room.contact { border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border)); }
.room.full { opacity: .82; }

.host { display: flex; align-items: center; gap: 12px; min-width: 0; }
.avatar {
  width: 42px; height: 42px; flex-shrink: 0; border-radius: 12px; display: grid; place-items: center;
  font-family: var(--font-headline); font-weight: 700; font-size: 15px;
  background: var(--color-surface-variant); color: var(--color-text-secondary); border: 1px solid var(--color-border);
}
.avatar.contact { background: linear-gradient(145deg, var(--color-primary-light), var(--color-primary-dark)); color: #1a1408; border-color: transparent; }
.host-meta { display: flex; flex-direction: column; min-width: 0; }
.host-name { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--color-text); font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.host-rep { font-size: 12px; color: var(--color-text-tertiary); }
.host-seated { font-size: 12px; color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.tag { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; padding: 2px 6px; border-radius: 6px; }
.tag.friend { background: rgba(205,163,80,.18); color: var(--color-primary-light); }
.elo-mini { color: var(--color-primary-light); font-weight: 700; font-family: var(--font-mono); }

.room-stats { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
.stat { font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; background: var(--color-surface-variant); color: var(--color-text-secondary); white-space: nowrap; }
.stat.open { background: rgba(122,166,79,.18); color: var(--color-success-light); }
.stat.playing { background: rgba(94,154,166,.16); color: var(--color-info-light); }
.stat.busy { background: var(--color-surface-variant); color: var(--color-text-tertiary); }
.stat.ghost { background: transparent; color: var(--color-text-tertiary); padding: 3px 4px; }

.join { padding: 9px 18px; font-size: 14px; min-width: 92px; }

@media (max-width: 560px) {
  .room { grid-template-columns: 1fr auto; }
  .room-stats { grid-column: 1 / -1; flex-direction: row; align-items: center; order: 3; }
  .join { grid-row: 1; grid-column: 2; }
  .create-btn { margin-left: 0; width: 100%; }
  .create-row { flex-direction: column; align-items: stretch; }
}
</style>
