<template>
  <div class="ws-demo">
    <h2>WebSocket Proxy Client Demo</h2>
    
    <div class="connection-status">
      <div class="status-indicator" :class="{ connected: isConnected }"></div>
      <span>Status: {{ isConnected ? 'Connected' : 'Disconnected' }}</span>
      <span v-if="token"> | Token: {{ token }}</span>
      <span v-if="localId"> | Local ID: {{ localId }}</span>
    </div>

    <div class="controls">
      <button @click="connect" :disabled="isConnected">Connect</button>
      <button @click="disconnect" :disabled="!isConnected">Disconnect</button>
      <button @click="publishChannel" :disabled="!isConnected">Publish to "demo-channel"</button>
      <button @click="listChannel" :disabled="!isConnected">List "demo-channel"</button>
    </div>

    <div class="messages">
      <h3>Messages</h3>
      <div class="message-list">
        <div v-for="(msg, index) in messages" :key="index" class="message">
          <strong>{{ msg.type }}:</strong> {{ msg.content }}
        </div>
      </div>
    </div>

    <div class="active-connections">
      <h3>Active Connections ({{ activeConnections.size }})</h3>
      <ul>
        <li v-for="[token, data] in activeConnections" :key="token">
          {{ token }} - since {{ new Date(data.connectedAt).toLocaleTimeString() }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
import { getWebSocketProxyClient } from '@dotrino/proxy-client'

export default {
  name: 'WSConnectionDemo',
  data() {
    return {
      client: null,
      isConnected: false,
      token: null,
      localId: null,
      messages: [],
      activeConnections: new Map()
    }
  },
  mounted() {
    this.client = getWebSocketProxyClient({
      url: 'wss://proxy.dotrino.com',
      autoReconnect: true,
      maxReconnectAttempts: 3,
      reconnectDelay: 2000
    })

    // Set up event handlers
    this.client.on('connect', (localId) => {
      this.localId = localId
      this.addMessage('connect', `Connected with local ID: ${localId}`)
    })

    this.client.on('token_assigned', (token) => {
      this.token = token
      this.isConnected = true
      this.addMessage('token_assigned', `Token assigned: ${token}`)
    })

    this.client.on('message', (from, message, timestamp) => {
      this.addMessage('message', `From ${from}: ${message}`)
    })

    this.client.on('paired', (token) => {
      this.addMessage('paired', `Paired with ${token}`)
      this.updateActiveConnections()
    })

    this.client.on('unpaired', (token, timestamp) => {
      this.addMessage('unpaired', `Unpaired from ${token}`)
      this.updateActiveConnections()
    })

    this.client.on('disconnect', (data) => {
      this.isConnected = false
      this.token = null
      this.addMessage('disconnect', `Disconnected: ${data.reason || 'No reason'}`)
      this.updateActiveConnections()
    })

    this.client.on('published', (channel, timestamp) => {
      this.addMessage('published', `Published to channel ${channel}`)
    })

    this.client.on('channel_updated', (channel, tokens, count, timestamp) => {
      this.addMessage('channel_updated', `Channel ${channel} updated: ${count} tokens`)
    })

    this.client.on('error', (error) => {
      this.addMessage('error', `${error.type}: ${error.error || 'Unknown error'}`)
    })
  },
  methods: {
    async connect() {
      try {
        this.addMessage('action', 'Connecting to server...')
        await this.client.connect()
      } catch (error) {
        this.addMessage('error', `Connection failed: ${error.message}`)
      }
    },

    disconnect() {
      this.client.disconnect()
    },

    async publishChannel() {
      try {
        await this.client.publish('demo-channel')
      } catch (error) {
        this.addMessage('error', `Publish failed: ${error.message}`)
      }
    },

    async listChannel() {
      try {
        const tokens = await this.client.listChannel('demo-channel')
        this.addMessage('info', `Channel tokens: ${tokens.join(', ') || 'None'}`)
      } catch (error) {
        this.addMessage('error', `List channel failed: ${error.message}`)
      }
    },

    addMessage(type, content) {
      this.messages.unshift({
        type,
        content,
        timestamp: new Date().toLocaleTimeString()
      })
      // Keep only last 20 messages
      if (this.messages.length > 20) {
        this.messages.pop()
      }
    },

    updateActiveConnections() {
      this.activeConnections = this.client.getActiveConnections()
    }
  },
  beforeUnmount() {
    if (this.client && this.client.isConnected()) {
      this.client.disconnect()
    }
  }
}
</script>

<style scoped>
.ws-demo {
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 8px;
  max-width: 800px;
  margin: 20px auto;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 4px;
}

.status-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ccc;
}

.status-indicator.connected {
  background: #4caf50;
}

.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.controls button {
  padding: 8px 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}

.controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.controls button:hover:not(:disabled) {
  background: #f0f0f0;
}

.messages {
  margin-bottom: 20px;
}

.message-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 10px;
}

.message {
  padding: 5px 0;
  border-bottom: 1px solid #f0f0f0;
}

.message:last-child {
  border-bottom: none;
}

.message strong {
  margin-right: 5px;
}

.active-connections ul {
  list-style: none;
  padding: 0;
}

.active-connections li {
  padding: 5px 0;
  border-bottom: 1px solid #f0f0f0;
}
</style>