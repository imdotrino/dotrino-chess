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

/** @typedef {import('../types.js').Square} Square */
/** @typedef {import('../types.js').TargetSquare} TargetSquare */
/** @typedef {import('../types.js').ChessState} ChessState */
/** @typedef {import('@dotrino/lobby').Room} Room */
/** @typedef {import('@dotrino/lobby').RoomSummary} RoomSummary */
/** @typedef {import('@dotrino/reputation').EloEntry} EloEntry */
/**
 * El Lobby real lleva su transporte en `transport` (lo lee el host para conocer su
 * token); la declaración de @dotrino/lobby 0.10.2 no lo publica.
 * @typedef {import('@dotrino/lobby').Lobby & { transport?: { token: string | null } }} ChessLobby
 */
/**
 * Estado de la sala tal como llega: el juego es el del motor de ajedrez, y el
 * lobby añade `mySeatId` personalizado por destinatario.
 * @typedef {Omit<import('@dotrino/lobby').RoomState, 'game'> & { game: ChessState | null, mySeatId?: string | null }} ChessRoomState
 */
/**
 * Sala pública con el ELO del host, si se conoce. `hostName` lo manda el lobby en el
 * resumen y su declaración (0.10.2) no lo publica.
 * @typedef {RoomSummary & { hostElo?: number, hostName?: string | null }} PublicRoom
 */
/**
 * @typedef {object} PeerEntry
 * @property {string} pubkey
 * @property {import('@dotrino/identity').PeerInfo | null} peer
 * @property {string | null} announcedNickname
 */

const GAME_ID = 'chess'
/** @type {Array<'white' | 'black'>} */
const SEATS = ['white', 'black']

/**
 * El `message` de lo que se lanzó, si lo tiene.
 * @param {unknown} e
 * @returns {string | undefined}
 */
function errorMessage (e) {
  return (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') ? e.message : undefined
}

const engine = makeChessEngine({ ...rules, getAlgebraicNotation })

// ── estado reactivo (singleton) ────────────────────────────────────
/** @type {ChessLobby | null} */
let lobby = null
/** @type {import('@dotrino/identity').Identity | null} */
let identity = null
/** @type {import('@dotrino/reputation').VaultReputation | null} */
let reputation = null
/** @type {import('@dotrino/profile').ProfileProvider | null} */
let profileProvider = null

const room = shallowRef(/** @type {Room | null} */ (null))
const snapshot = ref(/** @type {ChessRoomState | null} */ (null))            // room.state
const connected = ref(false)
const mode = ref(/** @type {'host' | 'guest' | null} */ (null))
const visibility = ref(/** @type {string | null} */ (null))
const roomId = ref(/** @type {string | null} */ (null))              // host: == nuestro token ; guest: token del host
const myToken = ref(/** @type {string | null} */ (null))             // token propio del proxy
const publicHosts = ref(/** @type {string[]} */ ([]))           // roomIds (tokens de hosts) del canal de descubrimiento
const publicRooms = ref(/** @type {PublicRoom[]} */ ([]))           // resúmenes enriquecidos (host, asientos, viewers, isContact)
const lastPublicHostsUpdate = ref(/** @type {number | null} */ (null))
const myPubkey = ref(/** @type {string | null} */ (null))
// El nickname vive ÚNICAMENTE en el vault de identidad (id.dotrino.com); este
// ref es solo su espejo reactivo. Sin copia paralela en localStorage.
const myNickname = ref('')
const peerIdentities = ref(/** @type {Map<string, PeerEntry>} */ (new Map())) // pubkey → { pubkey, peer, announcedNickname }
const trustMap = ref(/** @type {Map<string, number>} */ (new Map()))       // pubkey → rating 0..5
const connectionError = ref(/** @type {string | null} */ (null))

// Nickname requerido (patrón del ecosistema: pedirlo al inicio o por acción).
const nickModalOpen = ref(false)
/** @type {(() => unknown) | null} */
let pendingNickAction = null

// ELO (habilidad por juego) — vive en el registro de reputación compartido.
const myElo = ref(/** @type {EloEntry | null} */ (null))               // { elo, games } del jugador local
/** @type {Map<string, { v: EloEntry, ts: number }>} */
const _eloCache = new Map()           // pubkey → { v:{elo,games}, ts }
const ELO_TTL = 60000

// estado de UI local (selección de pieza) — no viaja por el motor
const selectedPiece = ref(/** @type {Square | null} */ (null))
const validMoves = ref(/** @type {TargetSquare[]} */ ([]))

// ── helpers de identidad ───────────────────────────────────────────
/** @returns {Promise<import('@dotrino/identity').Identity | null>} */
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
  if (myPubkey.value) pubkeys.delete(myPubkey.value)
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
/**
 * @param {string | null | undefined} pubkey
 * @returns {Promise<EloEntry | null>}
 */
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
/** @param {{ coSigned?: { data: any, sigA: string, sigB: string }, a: string, b: string } | null | undefined} ev */
async function onResult (ev) {
  if (!reputation || typeof reputation.reportResult !== 'function' || !ev?.coSigned) return
  try {
    const res = await reputation.reportResult(ev.coSigned)
    const meIsA = samePubkeyStr(ev.a, myPubkey.value)
    const raw = meIsA ? res.a : res.b // { value, count }
    if (raw) { const mine = { elo: raw.value, games: raw.count }; myElo.value = mine; if (myPubkey.value) _eloCache.set(myPubkey.value, { v: mine, ts: Date.now() }) }
    // invalidar la caché del rival para que su ELO nuevo se vea en el lobby
    _eloCache.delete(meIsA ? ev.b : ev.a)
  } catch (_) {}
}
/**
 * ¿Dos pubkeys (JWK en JSON) son la misma llave?
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {boolean}
 */
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
    connectionError.value = errorMessage(e) || 'Error de conexión'
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

/**
 * Engancha la sala a los refs reactivos.
 * @param {Room} r
 * @returns {Room}
 */
function _bind (r) {
  room.value = r
  roomId.value = r.roomId
  const refresh = () => { snapshot.value = /** @type {ChessRoomState} */ ({ ...r.state }); refreshPeers() }
  r.on('update', refresh)
  r.on('ended', refresh)
  r.on('result', onResult) // resultado co-firmado → reportar para ELO
  r.on('closed', () => { connectionError.value = 'La sala se cerró'; refresh() })
  refresh()
  return r
}

// setMode imita la API vieja: cambia el rol de inmediato (para que la vista
// reaccione) y crea/une la sala en segundo plano.
/**
 * @param {'host' | 'guest' | null} m
 * @param {string | null} [vis] visibilidad de la mesa del host
 */
function setMode (m, vis = null) {
  if (m === 'host') {
    mode.value = 'host'
    visibility.value = vis
    // roomId es predecible: == token del transporte (ya conectado).
    roomId.value = lobby?.transport?.token || null
    myToken.value = roomId.value
    if (!lobby) throw new Error('lobby-not-connected')
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

// `hostPubkey` es la identidad del host: con ella el saludo sale SELLADO desde el primer
// mensaje (@dotrino/lobby ≥ 0.8.0). La trae el resumen de la lista de salas; por un enlace
// compartido no viene, y entonces la sala se presenta y la pregunta.
/**
 * @param {string} hostToken
 * @param {string | null} [hostPubkey]
 * @returns {Promise<boolean>}
 */
async function subscribeToHost (hostToken, hostPubkey = null) {
  if (!hostToken) return false
  const known = hostPubkey || (publicRooms.value.find(r => r.roomId === hostToken) || {}).hostPubkey || null
  try {
    if (!lobby) throw new Error('lobby-not-connected')
    const r = await lobby.joinRoom(hostToken, { playerName: myNickname.value, hostPubkey: known ?? undefined })
    _bind(r)
    return true
  } catch (e) {
    connectionError.value = errorMessage(e) || 'No se pudo unir'
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

/** @param {unknown} v */
function setSubscribedHost (v) { if (!v) { /* limpieza la hace setMode(null)/unsubscribe */ } }

async function listPublicHosts () {
  if (!lobby) return []
  try {
    // Resúmenes enriquecidos: host (pubkey), asientos libres, espectadores, y
    // ya ordenados amigos-primero + reputación (rankRooms en la lib). El INFO se
    // resuelve apenas responden los hosts; los eventos de watch mantienen la
    // lista fresca, así que la ventana corta no se nota.
    const rooms = /** @type {PublicRoom[]} */ (await lobby.listRooms({ timeout: 900 }))
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
/** @param {(() => unknown) | null | undefined} fn */
function requireNick (fn) {
  if (hasNick.value) { if (fn) fn(); return }
  pendingNickAction = typeof fn === 'function' ? fn : null
  nickModalOpen.value = true
}
/**
 * @param {string | null | undefined} v
 * @returns {Promise<boolean>}
 */
async function submitNick (v) {
  const name = (v || '').trim()
  if (name.length < 2) return false
  try {
    await setMyNickname(name)
  } catch (e) {
    console.warn('Could not save the nickname to the identity:', errorMessage(e) || e)
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
/** @param {string | null | undefined} nick */
async function setMyNickname (nick) {
  const v = (nick || '').trim().slice(0, 20)
  await ensureIdentity()
  // La identidad es la única fuente: sin vault no se guarda el nick (lanza).
  if (!identity) throw new Error('Identity vault not available')
  await identity.setMyNickname(v)
  myNickname.value = identity.me?.nickname || v
}
/**
 * @param {string} pubkey
 * @param {number} rating 0..5
 * @param {string} [notes]
 */
async function ratePeer (pubkey, rating, notes) {
  await ensureIdentity()
  if (!identity) throw new Error('Identity vault not available')
  const updated = await identity.setRating(pubkey, rating, notes)
  try { await identity.addContact({ publickey: pubkey }) } catch (_) {}
  if (reputation) { try { await reputation.rate(pubkey, { confianza: rating }, { notes }) } catch (_) {} }
  await refreshIdentity(); await refreshPeers()
  return updated
}
/**
 * @param {string} pubkey
 * @param {string} nick
 */
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
/** @param {string | null | undefined} piece */
function _ownsPiece (piece) {
  const c = _myColor(); if (!piece || !c) return false
  return c === 'white' ? piece === piece.toUpperCase() : piece === piece.toLowerCase()
}
const isMyTurn = computed(() => {
  const c = _myColor()
  return !!c && (snapshot.value?.game?.currentTurn === c) &&
    snapshot.value?.status === STATUS.PLAYING
})

/** @param {Square} position */
function selectPiece (position) {
  if (!isMyTurn.value) return
  const b = _board()
  const piece = b?.[position.row]?.[position.col]
  if (!piece || !_ownsPiece(piece)) { selectedPiece.value = null; validMoves.value = []; return }
  selectedPiece.value = position
  validMoves.value = getValidMoves(b, position.row, position.col, piece, snapshot.value?.game?.moveHistory || [])
}
/** @param {Square} toPosition */
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
/** @param {string} color */
function takeSeat (color) { room.value?.takeSeat(color); return true }
function leaveSeat () { room.value?.leaveSeat(); return true }
function surrender () { room.value?.action({ type: 'resign' }); return true }
/**
 * @param {boolean} [asHost]
 * @param {string | null} [color]
 */
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
  const mk = (/** @type {import('@dotrino/lobby').SeatView | undefined} */ seat) => (seat && seat.occupied)
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
