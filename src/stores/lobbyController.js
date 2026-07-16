// lobbyController — fuente única de verdad del ajedrez sobre
// @dotrino/lobby. Los 4 stores viejos (connection/game/host/
// player) quedan como shims que exponen su API delegando acá. Así se elimina el
// protocolo WS casero + versioning + host/playerGameStore sin tocar los
// componentes (deuda que CLAUDE.md manda migrar al paquete estándar).
//
// Es un singleton de módulo con estado reactivo de Vue (no Pinia): varios stores
// Pinia pueden leer estos mismos refs/computeds y comparten estado/reactividad.
//
// ⚠️ Verificar en navegador (Playwright, 2 identidades) — ver MIGRATION.md.

import { ref, shallowRef, computed } from 'vue'
import { createLobby, STATUS, discoveryChannel } from '@dotrino/lobby'
import { getWebSocketProxyClient } from '@dotrino/proxy-client'
import { Identity } from '@dotrino/identity'
import { createVaultReputation } from '@dotrino/reputation'
import { createVaultProfileProvider } from '@dotrino/profile'
import * as rules from '@/utils/chessRules'
import { getValidMoves, getAlgebraicNotation } from '@/stores/sharedGameLogic'
import { makeChessEngine } from '@/game/chessAdapter'

const GAME_ID = 'chess'
const SEATS = ['white', 'black']

const engine = makeChessEngine({ ...rules, getAlgebraicNotation })

// ── estado reactivo (singleton) ────────────────────────────────────
let lobby = null
let identity = null
let reputation = null
let profileProvider = null

const room = shallowRef(null)
const snapshot = ref(null)            // room.state
const connected = ref(false)
const mode = ref(null)                // null | 'host' | 'guest'
const visibility = ref(null)
const roomId = ref(null)              // host: == nuestro token ; guest: token del host
const myToken = ref(null)             // token propio del proxy
const publicHosts = ref([])           // roomIds (tokens de hosts) del canal de descubrimiento
const publicRooms = ref([])           // resúmenes enriquecidos (host, asientos, viewers, isContact)
const lastPublicHostsUpdate = ref(null)
const myPubkey = ref(null)
// El nickname vive ÚNICAMENTE en el vault de identidad (id.dotrino.com); este
// ref es solo su espejo reactivo. Sin copia paralela en localStorage.
const myNickname = ref('')
const peerIdentities = ref(new Map()) // pubkey → { pubkey, peer, announcedNickname }
const trustMap = ref(new Map())       // pubkey → rating 0..5
const connectionError = ref(null)

// Nickname requerido (patrón del ecosistema: pedirlo al inicio o por acción).
const nickModalOpen = ref(false)
let pendingNickAction = null

// ELO (habilidad por juego) — vive en el registro de reputación compartido.
const myElo = ref(null)               // { elo, games } del jugador local
const _eloCache = new Map()           // pubkey → { v:{elo,games}, ts }
const ELO_TTL = 60000

// estado de UI local (selección de pieza) — no viaja por el motor
const selectedPiece = ref(null)
const validMoves = ref([])

// ── helpers de identidad ───────────────────────────────────────────
async function ensureIdentity () {
  if (identity) return identity
  try { identity = await Identity.connect() } catch (_) { identity = null }
  if (identity) {
    try { reputation = createVaultReputation(identity) } catch (_) { reputation = null }
  }
  return identity
}

async function refreshIdentity () {
  await ensureIdentity()
  if (!identity) return
  myPubkey.value = identity.me?.publickey || null
  if (identity.me?.nickname) {
    myNickname.value = identity.me.nickname
  } else {
    // Migración única: el chess viejo guardaba el nick solo en
    // localStorage('chess_nickname'), nunca en el vault. Si el vault no lo tiene
    // y existe el legado, lo subimos al vault (única fuente) y borramos la copia
    // local — así los usuarios existentes no tienen que volver a teclearlo.
    const legacy = (localStorage.getItem('chess_nickname') || '').trim().slice(0, 20)
    if (legacy) {
      try {
        await identity.setMyNickname(legacy)
        myNickname.value = identity.me?.nickname || legacy
        localStorage.removeItem('chess_nickname')
      } catch (_) { /* reintenta en el próximo arranque */ }
    }
  }
  try {
    const all = await identity.listPeers()
    const next = new Map()
    for (const p of all) {
      const r = p?.myRating?.rating
      if (typeof r === 'number' && r > 0) next.set(p.publickey, r)
    }
    trustMap.value = next
  } catch (_) {}
}

// Reconstruye peerIdentities (por pubkey) desde asientos + espectadores.
async function refreshPeers () {
  const s = snapshot.value
  if (!s) return
  const pubkeys = new Set()
  for (const id of SEATS) { const seat = s.seats?.[id]; if (seat?.pubkey) pubkeys.add(seat.pubkey) }
  for (const sp of (s.spectators || [])) if (sp.pubkey) pubkeys.add(sp.pubkey)
  pubkeys.delete(myPubkey.value)
  const next = new Map()
  for (const pk of pubkeys) {
    const nameSeat = SEATS.map(id => s.seats?.[id]).find(seat => seat?.pubkey === pk)
    const nameSpec = (s.spectators || []).find(sp => sp.pubkey === pk)
    let peer = null
    if (identity) { try { peer = await identity.getPeer(pk) } catch (_) {} }
    next.set(pk, { pubkey: pk, peer, announcedNickname: (nameSeat || nameSpec)?.name || null })
  }
  peerIdentities.value = next
}

// ── ELO ─────────────────────────────────────────────────────────────
// Devuelve { elo, games } o null si el registro/ELO no está disponible (p.ej.
// reputation < 0.4.0): así la UI no muestra un ELO falso.
async function eloOf (pubkey) {
  if (!pubkey || !reputation || typeof reputation.eloOf !== 'function') return null
  const hit = _eloCache.get(pubkey)
  if (hit && (Date.now() - hit.ts) < ELO_TTL) return hit.v
  let v = null
  try { v = await reputation.eloOf(pubkey, GAME_ID) } catch (_) { v = null }
  if (v) _eloCache.set(pubkey, { v, ts: Date.now() })
  return v
}
async function loadMyElo () {
  if (!myPubkey.value) return
  _eloCache.delete(myPubkey.value)
  myElo.value = await eloOf(myPubkey.value)
}
// Reporta el resultado co-firmado al registro (idempotente: ambos lo envían) y
// refresca el ELO propio con lo que devuelve el server.
async function onResult (ev) {
  if (!reputation || typeof reputation.reportResult !== 'function' || !ev?.coSigned) return
  try {
    const res = await reputation.reportResult(ev.coSigned)
    const meIsA = samePubkeyStr(ev.a, myPubkey.value)
    const raw = meIsA ? res.a : res.b // { value, count }
    if (raw) { const mine = { elo: raw.value, games: raw.count }; myElo.value = mine; _eloCache.set(myPubkey.value, { v: mine, ts: Date.now() }) }
    // invalidar la caché del rival para que su ELO nuevo se vea en el lobby
    _eloCache.delete(meIsA ? ev.b : ev.a)
  } catch (_) {}
}
function samePubkeyStr (a, b) {
  if (!a || !b) return false
  if (a === b) return true
  try { const pa = JSON.parse(a), pb = JSON.parse(b); return pa.x === pb.x && pa.y === pb.y && pa.crv === pb.crv } catch (_) { return false }
}

// ── conexión / lobby ───────────────────────────────────────────────
async function connect () {
  if (lobby) { connected.value = true; return true }
  await ensureIdentity()
  try {
    lobby = await createLobby({
      gameId: GAME_ID,
      seats: SEATS,
      engine,
      proxy: getWebSocketProxyClient(),
      identity,
      reputation,
      start: 'full',
      onSeatVacated: 'pause',
      matchmaking: { preferContacts: true }
    })
  } catch (e) {
    connectionError.value = e?.message || 'Error de conexión'
    return false
  }
  myToken.value = lobby.transport?.token || null
  myPubkey.value = identity?.me?.publickey || myPubkey.value
  connected.value = true
  connectionError.value = null
  // refrescar lista de salas cuando cambia el canal de descubrimiento
  lobby.on('rooms-changed', () => { listPublicHosts() })
  await refreshIdentity()
  loadMyElo()
  // Deep-link de partida compartida: #table=<token> → unir directo como guest.
  try {
    const m = (location.hash || '').match(/[#&]table=([^&]+)/)
    if (m && m[1]) {
      const tk = decodeURIComponent(m[1])
      history.replaceState(null, '', location.pathname + location.search)
      mode.value = 'guest'; visibility.value = null
      subscribeToHost(tk)
    }
  } catch (_) {}
  return true
}

function _bind (r) {
  room.value = r
  roomId.value = r.roomId
  const refresh = () => { snapshot.value = { ...r.state }; refreshPeers() }
  r.on('update', refresh)
  r.on('ended', refresh)
  r.on('result', onResult) // resultado co-firmado → reportar para ELO
  r.on('closed', () => { connectionError.value = 'La sala se cerró'; refresh() })
  refresh()
  return r
}

// setMode imita la API vieja: cambia el rol de inmediato (para que la vista
// reaccione) y crea/une la sala en segundo plano.
function setMode (m, vis = null) {
  if (m === 'host') {
    mode.value = 'host'
    visibility.value = vis
    // roomId es predecible: == token del transporte (ya conectado).
    roomId.value = lobby?.transport?.token || null
    myToken.value = roomId.value
    lobby.createRoom({ playerName: myNickname.value }).then(_bind).catch(e => { connectionError.value = e?.message })
  } else if (m === 'guest') {
    mode.value = 'guest'
    visibility.value = null
  } else { // null → volver al lobby
    const r = room.value
    if (r) { r.leave().catch(() => {}) }
    room.value = null
    snapshot.value = null
    mode.value = null
    visibility.value = null
    roomId.value = null
  }
}

async function subscribeToHost (hostToken) {
  if (!hostToken) return false
  try {
    const r = await lobby.joinRoom(hostToken, { playerName: myNickname.value })
    _bind(r)
    return true
  } catch (e) {
    connectionError.value = e?.message || 'No se pudo unir'
    return false
  }
}

async function unsubscribe () {
  const r = room.value
  if (r) { try { await r.leave() } catch (_) {} }
  room.value = null
  snapshot.value = null
  return true
}

function setSubscribedHost (v) { if (!v) { /* limpieza la hace setMode(null)/unsubscribe */ } }

async function listPublicHosts () {
  if (!lobby) return []
  try {
    // Resúmenes enriquecidos: host (pubkey), asientos libres, espectadores, y
    // ya ordenados amigos-primero + reputación (rankRooms en la lib). El INFO se
    // resuelve apenas responden los hosts; los eventos de watch mantienen la
    // lista fresca, así que la ventana corta no se nota.
    const rooms = await lobby.listRooms({ timeout: 900 })
    // Enriquecer con el ELO del host (cacheado por pubkey).
    await Promise.all(rooms.map(async (r) => { if (r.hostPubkey) { const e = await eloOf(r.hostPubkey); if (e) r.hostElo = e.elo } }))
    publicRooms.value = rooms
    publicHosts.value = rooms.map(r => r.roomId)
    lastPublicHostsUpdate.value = Date.now()
    return publicHosts.value
  } catch (_) { return publicHosts.value }
}

// ── Nickname requerido ─────────────────────────────────────────────
const hasNick = computed(() => !!(myNickname.value && myNickname.value.trim().length >= 2))

// Ejecuta fn si hay nick; si no, abre el modal y la reanuda al guardar.
function requireNick (fn) {
  if (hasNick.value) { if (fn) fn(); return }
  pendingNickAction = typeof fn === 'function' ? fn : null
  nickModalOpen.value = true
}
async function submitNick (v) {
  const name = (v || '').trim()
  if (name.length < 2) return false
  try {
    await setMyNickname(name)
  } catch (e) {
    console.warn('No se pudo guardar el nick en tu identidad:', e?.message || e)
    return false
  }
  nickModalOpen.value = false
  const a = pendingNickAction; pendingNickAction = null
  if (a) { try { await a() } catch (_) {} }
  return true
}
function cancelNick () { nickModalOpen.value = false; pendingNickAction = null }

function disconnect () { setMode(null); connected.value = false }

// ── identidad / reputación (UI de perfil/rating) ───────────────────
async function setMyNickname (nick) {
  const v = (nick || '').trim().slice(0, 20)
  await ensureIdentity()
  // La identidad es la única fuente: sin vault no se guarda el nick (lanza).
  if (!identity) throw new Error('Identity vault not available')
  await identity.setMyNickname(v)
  myNickname.value = identity.me?.nickname || v
}
async function ratePeer (pubkey, rating, notes) {
  await ensureIdentity()
  if (!identity) throw new Error('Identity vault not available')
  const updated = await identity.setRating(pubkey, rating, notes)
  try { await identity.addContact({ publickey: pubkey }) } catch (_) {}
  if (reputation) { try { await reputation.rate(pubkey, { confianza: rating }, { notes }) } catch (_) {} }
  await refreshIdentity(); await refreshPeers()
  return updated
}
async function setPeerNickname (pubkey, nick) {
  await ensureIdentity()
  if (!identity) throw new Error('Identity vault not available')
  const updated = await identity.setNickname(pubkey, nick)
  await refreshPeers()
  return updated
}
function getReputation () { return reputation }
// Instancia de identidad YA conectada (la del lobby). La consume el
// <dotrino-topbar> para el avatar del perfil activo y el modal de perfil. No
// abrimos un segundo Identity.connect(): sería otro iframe del mismo vault.
async function getIdentity () { return await ensureIdentity() }
// Provider para el Web Component compartido <dotrino-profile> (mismo del
// ecosistema): datos del vault + reputación de la nube. Para "mi perfil" propio.
async function getProfileProvider () {
  if (profileProvider) return profileProvider
  await ensureIdentity()
  if (!identity) return null
  try { profileProvider = createVaultProfileProvider({ identity, reputation }) } catch (_) { profileProvider = null }
  return profileProvider
}

// ── juego ──────────────────────────────────────────────────────────
function _board () { return snapshot.value?.game?.board || rules.createInitialBoard() }
function _myColor () { return room.value?.mySeat || null }
function _ownsPiece (piece) {
  const c = _myColor(); if (!piece || !c) return false
  return c === 'white' ? piece === piece.toUpperCase() : piece === piece.toLowerCase()
}
const isMyTurn = computed(() => {
  const c = _myColor()
  return !!c && (snapshot.value?.game?.currentTurn === c) &&
    snapshot.value?.status === STATUS.PLAYING
})

function selectPiece (position) {
  if (!isMyTurn.value) return
  const b = _board()
  const piece = b?.[position.row]?.[position.col]
  if (!piece || !_ownsPiece(piece)) { selectedPiece.value = null; validMoves.value = []; return }
  selectedPiece.value = position
  validMoves.value = getValidMoves(b, position.row, position.col, piece, snapshot.value?.game?.moveHistory || [])
}
function makeMove (toPosition) {
  const r = room.value
  if (!r || !selectedPiece.value) return false
  const from = selectedPiece.value
  const b = _board()
  const piece = b?.[from.row]?.[from.col]
  r.action({ type: 'move', from, to: toPosition, piece, captured: b?.[toPosition.row]?.[toPosition.col] || '' })
  selectedPiece.value = null; validMoves.value = []
  return true
}
function takeSeat (color) { room.value?.takeSeat(color); return true }
function leaveSeat () { room.value?.leaveSeat(); return true }
function surrender () { room.value?.action({ type: 'resign' }); return true }
function startGame (asHost = false, color = null) { if (color) takeSeat(color) }
async function resetGame () {
  const wasHost = mode.value === 'host'
  await unsubscribe()
  if (wasHost) { setMode('host', visibility.value) }
}
async function destroyHostInstance () { await unsubscribe(); mode.value = null; roomId.value = null }

// ── derivados de estado de juego (forma vieja) ─────────────────────
const board = computed(() => snapshot.value?.game?.board || rules.createInitialBoard())
const currentTurn = computed(() => snapshot.value?.game?.currentTurn || 'white')
const moveHistory = computed(() => snapshot.value?.game?.moveHistory || [])
const timers = computed(() => snapshot.value?.game?.timers || { white: 0, black: 0, lastUpdate: null })
const winner = computed(() => snapshot.value?.result?.winner ?? null)
const gameStatus = computed(() => {
  const s = snapshot.value
  if (!s) return 'waiting'
  if (s.status === STATUS.ENDED) {
    const r = s.result?.reason
    if (r === 'checkmate') return 'checkmate'
    if (r === 'stalemate') return 'stalemate'
    return 'finished'
  }
  if (s.status === STATUS.PLAYING) return s.game?.check ? 'check' : 'playing'
  return s.status // 'waiting' | 'paused'
})
const seats = computed(() => {
  const sx = snapshot.value?.seats || {}
  const mk = (seat) => (seat && seat.occupied)
    ? { occupied: true, playerToken: seat.pubkey, playerName: seat.name }
    : { occupied: false, playerToken: null, playerName: null }
  return { white: mk(sx.white), black: mk(sx.black) }
})
const spectators = computed(() => snapshot.value?.spectators || [])
const spectatorsCount = computed(() => spectators.value.length)
// Derivado del snapshot (reactivo en cada cambio), no de room.value (shallowRef
// que no dispara al mutar asientos). El lib personaliza mySeatId por destinatario.
const mySeatColor = computed(() => {
  const s = snapshot.value
  if (!s) return null
  if (s.mySeatId) return s.mySeatId
  if (myPubkey.value && s.seats) {
    for (const id of SEATS) if (s.seats[id]?.pubkey === myPubkey.value) return id
  }
  return null
})
const playerColor = mySeatColor
const isSeated = computed(() => !!mySeatColor.value)
const isSpectator = computed(() => connected.value && !!room.value && !mySeatColor.value)
const bothSeatsOccupied = computed(() => !!(seats.value.white.occupied && seats.value.black.occupied))
const availableSeats = computed(() => SEATS.filter(c => !seats.value[c].occupied))

// ── conexión / rol (forma vieja) ───────────────────────────────────
const isConnected = computed(() => connected.value)
const isHost = computed(() => mode.value === 'host')
const isGuest = computed(() => mode.value === 'guest')
const token = computed(() => (mode.value === 'host' ? roomId.value : myToken.value))
const shortToken = token
const subscribedHost = computed(() => (mode.value === 'guest' ? (snapshot.value?.hostPubkey || roomId.value) : null))
const subscribers = computed(() => {
  if (mode.value !== 'host') return []
  const out = []
  for (const id of SEATS) { const seat = snapshot.value?.seats?.[id]; if (seat?.pubkey && seat.pubkey !== myPubkey.value) out.push(seat.pubkey) }
  for (const sp of (snapshot.value?.spectators || [])) if (sp.pubkey && sp.pubkey !== myPubkey.value) out.push(sp.pubkey)
  return out
})
const subscribersCount = computed(() => subscribers.value.length)
const connectionStatus = computed(() => connectionError.value ? 'error' : (connected.value ? 'connected' : 'disconnected'))
const canPlay = computed(() => connected.value && !!room.value)

export const lobbyController = {
  // conexión / rol
  connect, disconnect, setMode, subscribeToHost, unsubscribe, setSubscribedHost,
  listPublicHosts, refreshIdentity,
  isConnected, isHost, isGuest, mode, visibility, token, shortToken, myToken,
  roomId, subscribedHost, subscribers, subscribersCount, publicHosts, publicRooms,
  lastPublicHostsUpdate, connectionError, connectionStatus, canPlay,
  // identidad / reputación
  myPubkey, myNickname, peerIdentities, trustMap, setMyNickname, ratePeer,
  setPeerNickname, getIdentity, getReputation, getProfileProvider,
  // nickname requerido
  hasNick, nickModalOpen, requireNick, submitNick, cancelNick,
  // ELO
  myElo, eloOf,
  // juego
  board, currentTurn, moveHistory, timers, winner, gameStatus, seats, spectators,
  spectatorsCount, mySeatColor, playerColor, isSeated, isSpectator, isMyTurn,
  bothSeatsOccupied, availableSeats, selectedPiece, validMoves,
  selectPiece, makeMove, takeSeat, leaveSeat, surrender, startGame, resetGame,
  destroyHostInstance,
  // expuestos para shims
  room
}
