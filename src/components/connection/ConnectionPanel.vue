<template>
  <div class="connection-panel">
    <div class="panel-header">
      <h3>Conexión del Juego</h3>
    </div>
    
    <div class="connection-status" :class="connectionStatus">
      <div class="status-indicator"></div>
      <span class="status-text">{{ statusText }}</span>
    </div>
    
    <div v-if="connectionStore.isConnected" class="connected-info">
      <div class="token-section">
        <label>Tu Token:</label>
        <div class="token-display">
          <code class="token-value">{{ connectionStore.shortToken }}</code>
          <button 
            @click="copyToken" 
            class="copy-button"
            :title="copyButtonText"
          >
            {{ copyButtonText }}
          </button>
        </div>
        <p class="token-help">
          Comparte este token con tu oponente para que pueda conectarse a ti.
        </p>
      </div>
      
      <div class="opponent-section">
        <label for="opponentToken">Token del Oponente:</label>
        <div class="token-input-group">
          <input
            id="opponentToken"
            v-model="opponentTokenInput"
            type="text"
            placeholder="Ej: ABCD"
            :disabled="!!connectionStore.opponentToken"
            class="token-input"
          />
          <button
            v-if="!connectionStore.opponentToken"
            @click="setOpponentToken"
            :disabled="!isValidToken(opponentTokenInput)"
            class="connect-button"
          >
            Conectar
          </button>
          <button
            v-else
            @click="clearOpponentToken"
            class="disconnect-button"
          >
            Desconectar
          </button>
        </div>
        <p v-if="connectionStore.opponentToken" class="connected-info-text">
          Conectado a: <strong>{{ connectionStore.opponentToken }}</strong>
        </p>
      </div>
      
      <div class="game-controls" v-if="connectionStore.canPlay">
        <div class="role-selection">
          <label>Rol:</label>
          <div class="role-buttons">
            <button
              @click="setAsHost"
              :class="{ active: isHost }"
              class="role-button"
            >
              Host
            </button>
            <button
              @click="setAsGuest"
              :class="{ active: !isHost }"
              class="role-button"
            >
              Guest
            </button>
          </div>
        </div>
        
        <div class="start-game-section">
          <button
            @click="startGame"
            :disabled="!canStartGame"
            class="start-game-button"
          >
            {{ startButtonText }}
          </button>
        </div>
      </div>
    </div>
    
    <div v-else class="disconnected-info">
      <p>Conéctate al servidor WebSocket para comenzar.</p>
      <button
        @click="connect"
        :disabled="isConnecting"
        class="connect-ws-button"
      >
        {{ isConnecting ? 'Conectando...' : 'Conectar' }}
      </button>
      
      <div v-if="connectionStore.connectionError" class="error-message">
        <p><strong>Error:</strong> {{ connectionStore.connectionError }}</p>
        <button @click="clearError" class="clear-error-button">
          Limpiar error
        </button>
      </div>
    </div>
    
    <div class="connection-actions">
      <button
        v-if="connectionStore.isConnected"
        @click="disconnect"
        class="disconnect-button"
      >
        Desconectar
      </button>
      <button
        @click="resetAll"
        class="reset-button"
      >
        Reiniciar Todo
      </button>
    </div>
    
    <div class="debug-info" v-if="showDebugInfo">
      <details>
        <summary>Información de Depuración</summary>
        <pre class="debug-data">{{ debugData }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useConnectionStore } from '@/stores/connectionStore'
import { useGameStore } from '@/stores/gameStore'

// Stores
const connectionStore = useConnectionStore()
const gameStore = useGameStore()

// Estado local
const opponentTokenInput = ref('')
const isConnecting = ref(false)
const isHost = ref(false)
const copied = ref(false)

// Computed
const connectionStatus = computed(() => connectionStore.connectionStatus)
const statusText = computed(() => {
  switch (connectionStore.connectionStatus) {
    case 'connected': return 'Conectado al servidor'
    case 'connecting': return 'Conectando...'
    case 'error': return 'Error de conexión'
    default: return 'Desconectado'
  }
})

const copyButtonText = computed(() => copied.value ? '¡Copiado!' : 'Copiar')
const canStartGame = computed(() => connectionStore.canPlay)
const startButtonText = computed(() => {
  if (isHost.value) return 'Iniciar Partida (como Host)'
  return 'Esperando al Host...'
})

const showDebugInfo = computed(() => {
  return import.meta.env.VITE_DEBUG_MODE === 'true'
})

const debugData = computed(() => {
  return JSON.stringify({
    uuid: connectionStore.uuid,
    shortToken: connectionStore.shortToken,
    opponentToken: connectionStore.opponentToken,
    isConnected: connectionStore.isConnected,
    gameStatus: gameStore.gameStatus,
    playerColor: gameStore.playerColor,
    isHost: gameStore.isHost
  }, null, 2)
})

// Métodos
function isValidToken(token) {
  // Validar formato básico de token (solo letras y números, 4-6 caracteres)
  return token && /^[A-Z1-9]{4,6}$/.test(token)
}

async function connect() {
  isConnecting.value = true
  try {
    await connectionStore.connect()
  } catch (error) {
    console.error('Error conectando:', error)
  } finally {
    isConnecting.value = false
  }
}

function disconnect() {
  connectionStore.disconnect()
  opponentTokenInput.value = ''
}

function setOpponentToken() {
  if (isValidToken(opponentTokenInput.value)) {
    connectionStore.setOpponentToken(opponentTokenInput.value)
  }
}

function clearOpponentToken() {
  connectionStore.setOpponentToken(null)
  opponentTokenInput.value = ''
}

function copyToken() {
  if (!connectionStore.shortToken) return
  
  navigator.clipboard.writeText(connectionStore.shortToken)
    .then(() => {
      copied.value = true
      setTimeout(() => {
        copied.value = false
      }, 2000)
    })
    .catch(err => {
      console.error('Error copiando token:', err)
      // Fallback para navegadores antiguos
      const textArea = document.createElement('textarea')
      textArea.value = connectionStore.shortToken
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      
      copied.value = true
      setTimeout(() => {
        copied.value = false
      }, 2000)
    })
}

function setAsHost() {
  isHost.value = true
}

function setAsGuest() {
  isHost.value = false
}

function startGame() {
  if (!connectionStore.canPlay) return
  
  if (isHost.value) {
    gameStore.startGame(true, 'white')
  } else {
    // Como guest, esperamos que el host inicie el juego
    console.log('Esperando que el host inicie el juego...')
  }
}

function clearError() {
  connectionStore.clearError()
}

function resetAll() {
  connectionStore.reset()
  gameStore.resetGame()
  opponentTokenInput.value = ''
  isHost.value = false
  copied.value = false
}

// Inicialización
onMounted(() => {
  // Cargar token del oponente si existe
  if (connectionStore.opponentToken) {
    opponentTokenInput.value = connectionStore.opponentToken
  }
  
  // Los eventos de conexión son manejados por connectionStore
  // No se necesitan listeners adicionales aquí
})
</script>

<style scoped>
.connection-panel {
  background: var(--color-card-bg);
  border-radius: 8px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.panel-header {
  margin-bottom: 20px;
  border-bottom: 1px solid #eaeaea;
  padding-bottom: 10px;
}

.panel-header h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 18px;
}

.connection-status {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
  padding: 10px;
  border-radius: 6px;
  background: var(--color-surface);
}

.connection-status.connected {
  background: rgba(76, 175, 80, 0.1);
}

.connection-status.error {
  background: rgba(244, 67, 54, 0.1);
}

.status-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 10px;
}

.connection-status.connected .status-indicator {
  background: var(--color-button-success);
  box-shadow: 0 0 8px var(--color-success-light);
}

.connection-status.error .status-indicator {
  background: var(--color-button-danger);
  box-shadow: 0 0 8px var(--color-error-light);
}

.connection-status:not(.connected):not(.error) .status-indicator {
  background: var(--color-button-warning);
  box-shadow: 0 0 8px var(--color-warning-light);
}

.status-text {
  font-weight: 500;
  color: var(--color-text-secondary);
}

.connected-info,
.disconnected-info {
  margin-bottom: 20px;
}

.token-section,
.opponent-section {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.token-display {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.token-value {
  flex: 1;
  padding: 10px 12px;
  background: var(--color-surface-variant);
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 16px;
  font-weight: bold;
  letter-spacing: 1px;
  color: var(--color-text);
  text-align: center;
}

.copy-button {
  padding: 10px 16px;
  background: var(--color-button-primary);
  color: var(--color-text-on-primary);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
  min-width: 80px;
}

.copy-button:hover {
  background: #1976d2;
}

.token-help {
  margin: 0;
  font-size: 12px;
  color: #666;
  font-style: italic;
}

.token-input-group {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}

.token-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
  font-family: 'Courier New', monospace;
  letter-spacing: 1px;
  text-align: center;
}

.token-input:focus {
  outline: none;
  border-color: #2196f3;
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
}

.token-input:disabled {
  background: var(--color-surface-variant);
  color: #999;
  cursor: not-allowed;
}

.connect-button,
.disconnect-button,
.connect-ws-button,
.start-game-button,
.clear-error-button,
.reset-button {
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.connect-button {
  background: var(--color-button-success);
  color: var(--color-text-on-primary);
  min-width: 100px;
}

.connect-button:hover:not(:disabled) {
  background: #388e3c;
}

.connect-button:disabled {
  background: #c8e6c9;
  color: #666;
  cursor: not-allowed;
}

.disconnect-button {
  background: var(--color-button-danger);
  color: var(--color-text-on-primary);
  min-width: 100px;
}

.disconnect-button:hover {
  background: #d32f2f;
}

.connect-ws-button {
  background: var(--color-button-primary);
  color: var(--color-text-on-primary);
  width: 100%;
  margin-top: 10px;
}

.connect-ws-button:hover:not(:disabled) {
  background: #1976d2;
}

.connect-ws-button:disabled {
  background: #bbdefb;
  color: #666;
  cursor: not-allowed;
}

.connected-info-text {
  margin: 0;
  font-size: 14px;
  color: #4caf50;
}

.game-controls {
  margin-top: 25px;
  padding-top: 20px;
  border-top: 1px solid #eaeaea;
}

.role-selection {
  margin-bottom: 20px;
}

.role-buttons {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.role-button {
  flex: 1;
  padding: 10px;
  background: var(--color-surface-variant);
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.role-button:hover {
  background: #e8e8e8;
}

.role-button.active {
  background: var(--color-button-primary);
  color: var(--color-text-on-primary);
  border-color: #2196f3;
}

.start-game-section {
  margin-top: 20px;
}

.start-game-button {
  width: 100%;
  padding: 12px;
  background: var(--color-button-warning);
  color: var(--color-text-on-primary);
  font-size: 16px;
  font-weight: 600;
}

.start-game-button:hover:not(:disabled) {
  background: #f57c00;
}

.start-game-button:disabled {
  background: #ffe0b2;
  color: #999;
  cursor: not-allowed;
}

.error-message {
  margin-top: 15px;
  padding: 12px;
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid #ffcdd2;
  border-radius: 4px;
  color: #c62828;
}

.error-message p {
  margin: 0 0 10px 0;
  font-size: 14px;
}

.clear-error-button {
  background: transparent;
  color: #c62828;
  border: 1px solid #c62828;
  padding: 6px 12px;
  font-size: 13px;
}

.clear-error-button:hover {
  background: #c62828;
  color: var(--color-text-on-primary);
}

.connection-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #eaeaea;
}

.connection-actions .disconnect-button {
  flex: 1;
}

.reset-button {
  flex: 1;
  background: #9e9e9e;
  color: var(--color-text-on-primary);
}

.reset-button:hover {
  background: #757575;
}

.debug-info {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px dashed #ddd;
}

.debug-info summary {
  cursor: pointer;
  color: #666;
  font-size: 13px;
  font-weight: 500;
  padding: 5px 0;
}

.debug-info summary:hover {
  color: var(--color-text);
}

.debug-data {
  margin-top: 10px;
  padding: 10px;
  background: var(--color-surface-variant);
  border-radius: 4px;
  font-size: 11px;
  font-family: 'Courier New', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}
</style>
