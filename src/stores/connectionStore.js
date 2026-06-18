// connectionStore — shim sobre lobbyController (lib dotrino-lobby).
// Conserva la API que consumen los componentes; toda la lógica vive en el
// controller. Reemplaza al protocolo WS casero anterior.
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { lobbyController as c } from './lobbyController'

export const useConnectionStore = defineStore('connection', () => {
  // Legacy del panel manual por tokens (ConnectionPanel): se conservan como stubs.
  const opponentToken = ref(null)
  const setOpponentToken = (t) => { opponentToken.value = t }
  const clearError = () => { c.connectionError.value = null }
  const reset = () => { c.disconnect() }

  return {
    // estado / rol
    isConnected: c.isConnected,
    isHost: c.isHost,
    isGuest: c.isGuest,
    mode: c.mode,
    visibility: c.visibility,
    token: c.token,
    shortToken: c.shortToken,
    uuid: c.token, // alias legacy
    subscribedHost: c.subscribedHost,
    subscribers: c.subscribers,
    subscribersCount: c.subscribersCount,
    publicHosts: c.publicHosts,
    publicRooms: c.publicRooms,
    lastPublicHostsUpdate: c.lastPublicHostsUpdate,
    connectionError: c.connectionError,
    connectionStatus: c.connectionStatus,
    canPlay: c.canPlay,
    opponentToken,
    // identidad / reputación
    myPubkey: c.myPubkey,
    myNickname: c.myNickname,
    peerIdentities: c.peerIdentities,
    trustMap: c.trustMap,
    // acciones de conexión / lobby
    connect: c.connect,
    disconnect: c.disconnect,
    setMode: c.setMode,
    subscribeToHost: c.subscribeToHost,
    unsubscribe: c.unsubscribe,
    setSubscribedHost: c.setSubscribedHost,
    listPublicHosts: c.listPublicHosts,
    publishToChessHosts: async () => true, // no-op: createRoom ya publica
    refreshIdentity: c.refreshIdentity,
    // identidad / reputación
    setMyNickname: c.setMyNickname,
    setPeerNickname: c.setPeerNickname,
    ratePeer: c.ratePeer,
    getReputation: c.getReputation,
    getProfileProvider: c.getProfileProvider,
    // nickname requerido
    hasNick: c.hasNick,
    nickModalOpen: c.nickModalOpen,
    requireNick: c.requireNick,
    submitNick: c.submitNick,
    cancelNick: c.cancelNick,
    // ELO
    myElo: c.myElo,
    eloOf: c.eloOf,
    // legacy
    setOpponentToken, clearError, reset
  }
})
