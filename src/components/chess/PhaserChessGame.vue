<template>
  <div class="phaser-chess-game">
    <!-- Overlay superior: Asiento Negras -->
    <div class="seat-bar black-seat-bar" :style="{ order: isFlipped ? 3 : 1 }">
      <div v-if="seats.black.occupied" class="seat-info occupied" :class="{ 'inactive-turn': gameStatus === 'playing' && currentTurn !== 'black' }">
        <span class="seat-icon">♚</span>
        <span class="player-name">{{ seats.black.playerName || t.player }}</span>
        
        <div class="player-indicators">
          <span v-if="gameStatus === 'check' && currentTurn === 'black'" class="check-indicator pulse-animation" :title="t.checkTitle">❌</span>
          <span class="player-timer">{{ formatTime(localTimers.black) }}</span>
          <span v-if="currentTurn === 'black' && (gameStatus === 'playing' || gameStatus === 'check')" class="turn-indicator" :title="t.yourTurnTitle">🟢</span>
        </div>

        <button 
          v-if="mySeatColor === 'black'" 
          @click="leaveSeat" 
          class="leave-seat-btn"
        >
          {{ t.leaveSeat }}
        </button>
      </div>
      <div v-else class="seat-info available">
        <span class="empty-seat">{{ t.emptySeat(t.black) }}</span>
        <button 
          v-if="!isSeated" 
          @click="occupySeat('black')" 
          class="take-seat-btn black-btn"
        >
          {{ t.takeSeat(t.black) }}
        </button>
      </div>
    </div>

    <!-- Contenedor del juego de Phaser -->
    <div class="board-wrapper" style="order: 2;">
      <div ref="gameContainer" class="game-container"></div>

      <!-- Overlay DOM del tablero para tests automatizados (Playwright).
           Cada celda lleva data-testid="square-{r}-{c}" y data-piece, y al
           hacer click delega en selectPiece/makeMove. Está sobre el canvas
           pero permite los gestos touch del Phaser para usuarios reales (no
           consume eventos cuando data-testid-board está oculto en estilos
           normales — pointer-events: none por defecto, se activa con la
           clase board-overlay-active). -->
      <div
        class="board-overlay"
        :class="{ flipped: isFlipped }"
        data-testid="board"
        :data-turn="currentTurn"
      >
        <div
          v-for="(row, r) in board"
          :key="`row-${r}`"
          class="board-row-overlay"
        >
          <button
            v-for="(piece, c) in row"
            :key="`sq-${r}-${c}`"
            :data-testid="`square-${r}-${c}`"
            :data-piece="piece || ''"
            class="square-overlay"
            tabindex="-1"
            @click.stop="onSquareClick(r, c)"
          >{{ piece || '' }}</button>
        </div>
      </div>
      

      
      <div v-if="gameStatus === 'checkmate'" class="game-status-overlay checkmate-overlay">
        <h2>{{ t.checkmateTitle }}</h2>
        <p>{{ t.winner(currentTurn === 'white' ? t.black : t.white) }}</p>
      </div>

      <div v-if="gameStatus === 'stalemate'" class="game-status-overlay stalemate-overlay">
        <h2>{{ t.drawTitle }}</h2>
        <p>{{ t.stalemateReason }}</p>
      </div>

      <div v-if="!gameInitialized" class="loading-overlay">
        <div class="loading-spinner"></div>
        <p>{{ t.initializing }}</p>
      </div>
      
      <div v-if="gameError" class="error-overlay">
        <p class="error-message">{{ gameError }}</p>
        <button @click="retryInitialization" class="retry-button">{{ t.retry }}</button>
      </div>

      <!-- Mensajes flotantes del juego sobre el tablero -->
      <div v-if="gameStatus === 'paused'" class="board-message">
        <p>{{ t.pausedMsg }}</p>
      </div>
      <div v-if="gameStatus === 'waiting' && !bothSeatsOccupied" class="board-message warning">
        <p>{{ t.waitingMsg }}</p>
      </div>
    </div>

    <!-- Overlay inferior: Asiento Blancas -->
    <div class="seat-bar white-seat-bar" :style="{ order: isFlipped ? 1 : 3 }">
      <div v-if="seats.white.occupied" class="seat-info occupied" :class="{ 'inactive-turn': gameStatus === 'playing' && currentTurn !== 'white' }">
        <span class="seat-icon">♔</span>
        <span class="player-name">{{ seats.white.playerName || t.player }}</span>
        
        <div class="player-indicators">
          <span v-if="gameStatus === 'check' && currentTurn === 'white'" class="check-indicator pulse-animation" :title="t.checkTitle">❌</span>
          <span class="player-timer">{{ formatTime(localTimers.white) }}</span>
          <span v-if="currentTurn === 'white' && (gameStatus === 'playing' || gameStatus === 'check')" class="turn-indicator" :title="t.yourTurnTitle">🟢</span>
        </div>

        <button 
          v-if="mySeatColor === 'white'" 
          @click="leaveSeat" 
          class="leave-seat-btn"
        >
          {{ t.leaveSeat }}
        </button>
      </div>
      <div v-else class="seat-info available">
        <span class="empty-seat">{{ t.emptySeat(t.white) }}</span>
        <button 
          v-if="!isSeated" 
          @click="occupySeat('white')" 
          class="take-seat-btn white-btn"
        >
          {{ t.takeSeat(t.white) }}
        </button>
      </div>
    </div>

    <!-- Información adicional (Espectadores y estado local) -->
    <div class="game-footer-info">
      <div class="player-status-indicator" :class="playerStatusClass">
        <span class="status-icon">{{ playerStatusIcon }}</span>
        <span class="status-text">{{ playerStatusText }}</span>
      </div>
      <div class="spectators-info">
        {{ t.spectators }}: {{ spectatorsCount }} 👁️
        <button class="share-table-btn" @click="emit('share')" data-testid="share-table">{{ t.shareTable }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import Phaser from 'phaser'
import { t } from '@/i18n'
import { useHostGameStore } from '@/stores/hostGameStore'
import { usePlayerGameStore } from '@/stores/playerGameStore'
import { useConnectionStore } from '@/stores/connectionStore'

// Props
const props = defineProps({
  boardSize: {
    type: Number,
    default: 800
  }
})
const emit = defineEmits(['share'])

// Refs
const gameContainer = ref(null)
const game = ref(null)
const gameInitialized = ref(false)
const gameError = ref(null)

// Stores
const connectionStore = useConnectionStore()

// Determinar qué store usar basado en el modo
const isHost = computed(() => connectionStore.isHost)
const hostGameStore = useHostGameStore()
const playerGameStore = usePlayerGameStore()

// Store activo (proxy que delega al store correcto)
const activeStore = computed(() => {
  return isHost.value ? hostGameStore : playerGameStore
})

// Estado del juego desde el store activo (computed para reactividad)
const board = computed(() => activeStore.value.board)
const currentTurn = computed(() => activeStore.value.currentTurn)
const selectedPiece = computed(() => activeStore.value.selectedPiece)
const validMoves = computed(() => activeStore.value.validMoves)
const gameStatus = computed(() => activeStore.value.gameStatus)
const moveHistory = computed(() => activeStore.value.moveHistory)
const playerColor = computed(() => activeStore.value.playerColor)
const seats = computed(() => activeStore.value.seats)
const spectators = computed(() => activeStore.value.spectators)
const timers = computed(() => activeStore.value.timers || { white: 0, black: 0, lastUpdate: Date.now() })

// Propiedad computada para saber si el tablero debe girarse
const isFlipped = computed(() => isSeated.value && mySeatColor.value === 'black')

// Local timer projection setup
const localTimers = ref({ white: 0, black: 0 })
let timerInterval = null

function updateLocalTimers() {
  const currentTimers = timers.value
  const tWhite = currentTimers.white || 0
  const tBlack = currentTimers.black || 0
  
  if (gameStatus.value === 'playing' || gameStatus.value === 'check') {
    const elapsed = Date.now() - (currentTimers.lastUpdate || Date.now())
    if (currentTurn.value === 'white') {
      localTimers.value = { white: tWhite + elapsed, black: tBlack }
    } else {
      localTimers.value = { white: tWhite, black: tBlack + elapsed }
    }
  } else {
    localTimers.value = { white: tWhite, black: tBlack }
  }
}

function formatTime(ms) {
  const totalSeconds = Math.floor((ms || 0) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

// Getters específicos del store activo
const isSeated = computed(() => {
  if (isHost.value) {
    return hostGameStore.isHostPlaying
  } else {
    return playerGameStore.isSeated
  }
})

const mySeatColor = computed(() => {
  if (isHost.value) {
    return hostGameStore.hostAsPlayerColor
  } else {
    return playerGameStore.mySeatColor
  }
})

const isSpectator = computed(() => {
  if (isHost.value) {
    return false // El host nunca es espectador
  } else {
    return playerGameStore.isSpectator
  }
})

const bothSeatsOccupied = computed(() => activeStore.value.bothSeatsOccupied)
const availableSeats = computed(() => activeStore.value.availableSeats)
const spectatorsCount = computed(() => activeStore.value.spectatorsCount)

// Computed properties para UI
const playerStatusText = computed(() => {
  if (isSeated.value) {
    const colorText = mySeatColor.value === 'white' ? t.value.white : t.value.black
    return `${t.value.player} (${colorText})${isHost.value ? ' [' + t.value.hostTag + ']' : ''}`
  } else if (isSpectator.value) {
    return t.value.roleSpectator
  } else if (isHost.value) {
    return t.value.roleHostNoSeat
  } else {
    return t.value.roleNoSeat
  }
})

const playerStatusIcon = computed(() => {
  if (isSeated.value) {
    return mySeatColor.value === 'white' ? '♔' : '♚'
  } else if (isSpectator.value) {
    return '👁️'
  } else if (isHost.value) {
    return '🏠'
  } else {
    return '🚫'
  }
})

const playerStatusClass = computed(() => {
  if (isSeated.value) {
    return `player-status-seated player-status-${mySeatColor.value}`
  } else if (isSpectator.value) {
    return 'player-status-spectator'
  } else {
    return 'player-status-no-seat'
  }
})

// Watchers
watch(() => board.value, (newBoard) => {
  if (gameInitialized.value && game.value) {
    updateBoardInPhaser(newBoard)
  }
}, { deep: true })

watch(() => isFlipped.value, () => {
  if (gameInitialized.value && game.value) {
    updateBoardInPhaser(board.value)
  }
})

watch(() => gameStatus.value, (newStatus) => {
  if (gameInitialized.value && game.value) {
    updateGameStatusInPhaser(newStatus)
  }
})

// Métodos
function retryInitialization() {
  gameError.value = null
  initializeGame()
}

/**
 * Click en el overlay DOM del tablero (test automation).
 * Pasa la posición lógica al mismo handler que usa Phaser.
 */
function onSquareClick(row, col) {
  handleSquareClick(row, col)
}

// Funciones de interacción con el juego
function handleSquareClick(row, col) {
  if (!isSeated.value || (gameStatus.value !== 'playing' && gameStatus.value !== 'check')) {
    return
  }
  
  // Verificar si es el turno del jugador
  const isMyTurn = isHost.value 
    ? hostGameStore.isHostTurn 
    : playerGameStore.isMyTurn
  
  if (!isMyTurn) {
    console.log('No es tu turno')
    return
  }
  
  // Si hay una pieza seleccionada, intentar mover o cambiar selección
  if (selectedPiece.value) {
    const clickedPiece = board.value[row][col]
    const pColor = mySeatColor.value
    
    // Check if the clicked piece belongs to the current player
    const isOwnPiece = clickedPiece && (
      (pColor === 'white' && clickedPiece === clickedPiece.toUpperCase()) ||
      (pColor === 'black' && clickedPiece === clickedPiece.toLowerCase())
    )
    
    // Si hace click en otra pieza propia, cambiar la selección
    if (isOwnPiece) {
      if (isHost.value) {
        hostGameStore.selectPieceAsHost({ row, col })
      } else {
        playerGameStore.selectPiece({ row, col })
      }
      return
    }
  
    // Si no es pieza propia, intentar el movimiento
    const moveSuccess = isHost.value
      ? hostGameStore.makeMoveAsHost({ row, col })
      : playerGameStore.makeMove({ row, col })
    
    if (moveSuccess) {
      console.log('Movimiento realizado')
    }
  } else {
    // Seleccionar pieza
    if (isHost.value) {
      hostGameStore.selectPieceAsHost({ row, col })
    } else {
      playerGameStore.selectPiece({ row, col })
    }
  }
}

function occupySeat(color) {
  if (isHost.value) {
    return hostGameStore.occupySeatAsHost(color)
  } else {
    return playerGameStore.requestSeat(color)
  }
}

function leaveSeat() {
  if (isHost.value) {
    return hostGameStore.leaveSeatAsHost()
  } else {
    return playerGameStore.requestLeaveSeat()
  }
}

// Funciones Phaser
function initializeGame() {
  try {
    if (!gameContainer.value) {
      gameError.value = 'Contenedor del juego no encontrado'
      return
    }
    
    // Respeta el tamaño solicitado por el contenedor (responsivo).
    const actualSize = Math.max(280, Math.min(props.boardSize, 600))
    
    const config = {
      type: Phaser.AUTO,
      width: actualSize,
      height: actualSize,
      parent: gameContainer.value,
      scene: {
        preload: preload,
        create: create,
        update: update
      },
      backgroundColor: '#f0d9b5',
      // No bloquear los gestos nativos del navegador: el usuario debe poder
      // hacer scroll vertical aunque el dedo arranque sobre el canvas.
      input: {
        mouse: { preventDefaultDown: false, preventDefaultUp: false, preventDefaultMove: false },
        touch: { capture: false }
      }
    }
    
    game.value = new Phaser.Game(config)
    gameInitialized.value = true
  } catch (error) {
    console.error('Error inicializando juego Phaser:', error)
    gameError.value = 'Error al inicializar el juego'
  }
}

function preload() {}

function create() {
  createSquareTextures.call(this)
  createBoard.call(this)
  updateBoardInPhaser.call(this, board.value)
}

function createSquareTextures() {
  const squareSize = 64 
  
  const whiteGraphics = this.add.graphics()
  whiteGraphics.fillStyle(0xf0d9b5, 1) // Color beige claro
  whiteGraphics.fillRect(0, 0, squareSize, squareSize)
  whiteGraphics.generateTexture('white-square', squareSize, squareSize)
  whiteGraphics.destroy()
  
  const blackGraphics = this.add.graphics()
  blackGraphics.fillStyle(0xb58863, 1) // Color marrón
  blackGraphics.fillRect(0, 0, squareSize, squareSize)
  blackGraphics.generateTexture('black-square', squareSize, squareSize)
  blackGraphics.destroy()
}

function update() {}

function createBoard() {
  const margin = 24
  const boardSize = game.value.config.width - (margin * 2)
  const squareSize = boardSize / 8
  
  // Fondo negro para las franjas de coordenadas
  this.add.rectangle(game.value.config.width/2, game.value.config.height/2, game.value.config.width, game.value.config.height, 0x1a1a1a)
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const visualRow = isFlipped.value ? 7 - row : row
      const visualCol = isFlipped.value ? 7 - col : col
      const x = margin + visualCol * squareSize + squareSize / 2
      const y = margin + visualRow * squareSize + squareSize / 2
      
      const isWhite = (row + col) % 2 === 0
      const square = this.add.image(x, y, isWhite ? 'white-square' : 'black-square')
        .setDisplaySize(squareSize, squareSize)
        .setInteractive()
      
      square.visualRow = visualRow
      square.visualCol = visualCol
      
      square.on('pointerdown', () => {
        const clickedRow = isFlipped.value ? 7 - square.visualRow : square.visualRow
        const clickedCol = isFlipped.value ? 7 - square.visualCol : square.visualCol
        handleSquareClick(clickedRow, clickedCol)
      })
    }
  }
}

function updateBoardInPhaser(newBoard) {
  if (!game.value || !game.value.scene) return
  
  const scene = game.value.scene.getScene('default')
  if (!scene) return
  
  if (scene.pieceGroup) {
    scene.pieceGroup.clear(true, true)
  } else {
    scene.pieceGroup = scene.add.group()
  }
  
  if (scene.coordGroup) {
    scene.coordGroup.clear(true, true)
  } else {
    scene.coordGroup = scene.add.group()
  }
  
  const margin = 24
  const boardSize = game.value.config.width - (margin * 2)
  const squareSize = boardSize / 8
  
  // Añadir coordenadas algebraicas en las franjas negras externas
  const textStyle = { fontSize: '14px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold' }
  for (let i = 0; i < 8; i++) {
    // Filas (1-8)
    const rankRow = i
    const visualRow = isFlipped.value ? 7 - rankRow : rankRow
    const rankText = (8 - rankRow).toString()
    const centerY = margin + visualRow * squareSize + squareSize / 2
    
    // Izquierda (col 0) franja
    const tLeft = scene.add.text(margin / 2, centerY, rankText, textStyle).setOrigin(0.5).setDepth(1)
    scene.coordGroup.add(tLeft)
    
    // Derecha (col 7) franja
    const tRight = scene.add.text(game.value.config.width - margin / 2, centerY, rankText, textStyle).setOrigin(0.5).setDepth(1)
    scene.coordGroup.add(tRight)
    
    // Columnas (A-H)
    const col = i
    const visualCol = isFlipped.value ? 7 - col : col
    const fileText = String.fromCharCode(65 + col)
    const centerX = margin + visualCol * squareSize + squareSize / 2
    
    // Arriba (visualRow 0) franja
    const tTop = scene.add.text(centerX, margin / 2, fileText, textStyle).setOrigin(0.5).setDepth(1)
    scene.coordGroup.add(tTop)
    
    // Abajo (visualRow 7) franja
    const tBottom = scene.add.text(centerX, game.value.config.height - margin / 2, fileText, textStyle).setOrigin(0.5).setDepth(1)
    scene.coordGroup.add(tBottom)
  }
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = newBoard[row][col]
      if (!piece) continue
      
      const visualRow = isFlipped.value ? 7 - row : row
      const visualCol = isFlipped.value ? 7 - col : col
      const x = margin + visualCol * squareSize + squareSize / 2
      const y = margin + visualRow * squareSize + squareSize / 2
      
      const pieceText = scene.add.text(x, y, getPieceSymbol(piece), {
        fontSize: Math.floor(squareSize * 0.6) + 'px',
        fontFamily: 'Arial, sans-serif',
        color: getPieceColor(piece) === 'white' ? '#FFFFFF' : '#000000',
        stroke: getPieceColor(piece) === 'white' ? '#000000' : '#FFFFFF',
        strokeThickness: 2,
        align: 'center'
      })
      .setOrigin(0.5)
      
      // Setup drag and drop for pieces of the player's color
      const pColor = mySeatColor.value
      const isPickable = piece && isSeated.value && (gameStatus.value === 'playing' || gameStatus.value === 'check') && (
        (pColor === 'white' && piece === piece.toUpperCase()) ||
        (pColor === 'black' && piece === piece.toLowerCase())
      )
      
      if (isPickable) {
        pieceText.setInteractive()
        scene.input.setDraggable(pieceText)
        
        // Save original row/col for snapping
        pieceText.originalRow = row
        pieceText.originalCol = col
        
        // Select piece instantly on pointerdown (allows immediate selection and drag synergy)
        pieceText.on('pointerdown', () => {
           handleSquareClick(row, col)
        })
      }
      
      scene.pieceGroup.add(pieceText)
    }
  }
  
  // Setup drag event listeners on the scene
  if (!scene.dragEventsAdded) {
    scene.input.on('dragstart', function (pointer, gameObject) {
       // Bring the dragged piece to the top
       scene.children.bringToTop(gameObject)
       // Selecting the piece is already handled by pointerdown
    })
    
    scene.input.on('drag', function (pointer, gameObject, dragX, dragY) {
       gameObject.x = dragX
       gameObject.y = dragY
    })
    
    scene.input.on('dragend', function (pointer, gameObject) {
       // Calculate target squares based on pointer coordinates
       let targetVisualCol = Math.floor((pointer.x - margin) / squareSize)
       let targetVisualRow = Math.floor((pointer.y - margin) / squareSize)
       
       const targetCol = isFlipped.value ? 7 - targetVisualCol : targetVisualCol
       const targetRow = isFlipped.value ? 7 - targetVisualRow : targetVisualRow
       
       const originalCol = gameObject.originalCol
       const originalRow = gameObject.originalRow
       const originalVisualCol = isFlipped.value ? 7 - originalCol : originalCol
       const originalVisualRow = isFlipped.value ? 7 - originalRow : originalRow
       
       // Snap back visually immediately
       gameObject.x = margin + originalVisualCol * squareSize + squareSize / 2
       gameObject.y = margin + originalVisualRow * squareSize + squareSize / 2
       
       // If dropped on a valid different square, trigger click there to execute move
       if ((targetCol !== originalCol || targetRow !== originalRow) && 
           targetCol >= 0 && targetCol < 8 && targetRow >= 0 && targetRow < 8) {
           
           // If we have valid moves and the target is one of them, executing jump
           const isValidTarget = validMoves.value.some(m => m.row === targetRow && m.col === targetCol)
           if (isValidTarget) {
               handleSquareClick(targetRow, targetCol)
           }
       }
    })
    
    scene.dragEventsAdded = true
  }
  
  // Highlight valid moves if there is a selected piece
  if (selectedPiece.value) {
     highlightValidMoves.call(scene, validMoves.value || [], squareSize, margin)
  } else if (scene.highlightGroup) {
     scene.highlightGroup.clear(true, true)
  }
}

function highlightValidMoves(moves, squareSize, margin) {
   // Add highlight indicators (small circles) for valid moves
   const scene = this
   if (!scene.highlightGroup) {
      scene.highlightGroup = scene.add.group()
   } else {
      scene.highlightGroup.clear(true, true)
   }
   
   // Dibujar el contorno cuadrado de pieza seleccionada
   if (selectedPiece.value) {
      const g = scene.add.graphics()
      g.lineStyle(4, 0x00FF00, 1) // Outline verde brillante
      const visualCol = isFlipped.value ? 7 - selectedPiece.value.col : selectedPiece.value.col
      const px = margin + visualCol * squareSize
      const visualRow = isFlipped.value ? 7 - selectedPiece.value.row : selectedPiece.value.row
      const py = margin + visualRow * squareSize
      g.strokeRect(px, py, squareSize, squareSize)
      scene.highlightGroup.add(g)
   }
   
   if (moves && moves.length > 0) {
      moves.forEach(move => {
         const targetVisualRow = isFlipped.value ? 7 - move.row : move.row
         const targetVisualCol = isFlipped.value ? 7 - move.col : move.col
         const dotX = margin + targetVisualCol * squareSize + squareSize / 2
         const dotY = margin + targetVisualRow * squareSize + squareSize / 2
         
         const dot = scene.add.circle(dotX, dotY, squareSize * 0.15, 0x000000, 0.3)
         scene.highlightGroup.add(dot)
      })
   }
}

// Watch both selectedPiece and validMoves to draw highlighting without redrawing all pieces
watch([() => selectedPiece.value, () => validMoves.value], () => {
   if (gameInitialized.value && game.value) {
      const scene = game.value.scene.getScene('default')
      const margin = 24
      const boardSize = game.value.config.width - (margin * 2)
      const squareSize = boardSize / 8
      if (scene) {
          if (selectedPiece.value) {
              highlightValidMoves.call(scene, validMoves.value || [], squareSize, margin)
          } else if (scene.highlightGroup) {
              scene.highlightGroup.clear(true, true)
          }
      }
   }
})
function getPieceSymbol(piece) {
  const pieceMap = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
  }
  return pieceMap[piece] || piece
}

function getPieceColor(piece) {
  if (!piece) return null
  return piece === piece.toUpperCase() ? 'white' : 'black'
}

function updateGameStatusInPhaser(newStatus) {}

// Lifecycle hooks
onMounted(() => {
  initializeGame()
  timerInterval = setInterval(updateLocalTimers, 100)
})

onBeforeUnmount(() => {
  if (timerInterval) clearInterval(timerInterval)
  if (game.value) {
    game.value.destroy(true)
    game.value = null
  }
})

// Exponer métodos para el componente padre
defineExpose({
  occupySeat,
  leaveSeat,
  resetGame: isHost.value ? hostGameStore.resetGame : playerGameStore.resetLocalGame
})
</script>

<style scoped>
.phaser-chess-game {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  gap: 15px;
  padding: 10px;
}

/* Permitir scroll vertical aunque el dedo arranque sobre el canvas Phaser.
   Los taps siguen funcionando (touch-action solo afecta gestos de pan/zoom). */
.phaser-chess-game :deep(canvas) {
  touch-action: pan-y;
}

@media (max-width: 768px) {
  .phaser-chess-game {
    gap: 4px;
    padding: 0;
  }
  .seat-bar {
    padding: 4px 8px;
    border-radius: 0;
    box-shadow: none;
    max-width: 100%;
  }
  .seat-icon { font-size: 18px; }
  .player-name { font-size: 0.9rem; }
  .player-indicators { gap: 6px; margin-right: 6px; }
  .player-timer { font-size: 0.85rem; }
}

.seat-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  max-width: 500px;
  padding: 10px 15px;
  border-radius: 8px;
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.black-seat-bar {
  border-top: 4px solid #212121;
}

.white-seat-bar {
  border-bottom: 4px solid #f5f5f5;
}

.seat-info {
  display: flex;
  align-items: center;
  gap: 15px;
  width: 100%;
  justify-content: space-between;
  transition: opacity 0.3s ease, filter 0.3s ease;
}

.inactive-turn {
  opacity: 0.5;
  filter: grayscale(100%);
}

.seat-icon {
  font-size: 24px;
}

.player-name {
  font-weight: bold;
  flex-grow: 1;
}

.player-indicators {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-right: 15px;
}

.player-timer {
  font-family: monospace;
  font-size: 1.2em;
  font-weight: bold;
  background: rgba(0, 0, 0, 0.1);
  padding: 4px 8px;
  border-radius: 4px;
}

.turn-indicator {
  font-size: 16px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
}

.empty-seat {
  color: var(--color-text-secondary);
  font-style: italic;
  flex-grow: 1;
}

.take-seat-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.black-btn {
  background-color: #424242;
}

.black-btn:hover {
  background-color: #212121;
}

.white-btn {
  background-color: #e0e0e0;
  color: #000;
}

.white-btn:hover {
  background-color: #bdbdbd;
}

.leave-seat-btn {
  padding: 8px 16px;
  background-color: var(--color-warning);
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
}

.leave-seat-btn:hover {
  background-color: #e65100;
}

.board-wrapper {
  position: relative;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: var(--shadow-md);
}

/* Overlay DOM del tablero — visible sólo a Playwright/lectores de pantalla.
   Encima del canvas pero con pointer-events: none para no interferir con
   los gestos del usuario. Los handlers @click siguen funcionando cuando
   son disparados programáticamente (page.click via DOM). */
.board-overlay {
  position: absolute;
  /* La grilla de Phaser tiene un margen de 24px y 8 cuadros del 100% del board.
     El canvas ocupa todo el ancho del board-wrapper; ajustamos el inset
     proporcionalmente para alinear con el render real. */
  top: 24px;
  left: 24px;
  right: 24px;
  bottom: 24px;
  display: grid;
  grid-template-rows: repeat(8, 1fr);
  pointer-events: none;
  z-index: 5;
}
.board-row-overlay {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
}
.board-overlay.flipped {
  transform: rotate(180deg);
}
.board-overlay.flipped .square-overlay {
  transform: rotate(180deg);
}
.square-overlay {
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  font: inherit;
  color: transparent;
  cursor: default;
  /* pointer-events: none → el usuario real interactúa con el canvas Phaser.
     Tests automatizados deben llamar `element.click()` directamente vía
     evaluate, lo que dispara el handler @click sin pasar por hit-testing. */
  pointer-events: none;
}
.square-overlay:focus { outline: none; }

.game-container {
  display: flex;
  justify-content: center;
}

.board-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(33, 150, 243, 0.85);
  color: white;
  padding: 10px 20px;
  border-radius: 20px;
  font-weight: bold;
  pointer-events: none;
}

.board-message.warning {
  background: rgba(255, 152, 0, 0.85);
}

.game-footer-info {
  display: flex;
  justify-content: space-between;
  width: 100%;
  max-width: 500px;
  align-items: center;
  padding: 5px 10px;
}

/* Game Status Overlays */
.game-status-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.85);
  border-radius: 12px;
  padding: 20px 40px;
  text-align: center;
  z-index: 20;
  pointer-events: none;
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}

@keyframes popIn {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

.game-status-overlay h2 {
  margin: 0 0 10px 0;
  font-size: 2.5rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.game-status-overlay p {
  margin: 0;
  font-size: 1.2rem;
  color: #DDD;
}

.check-overlay { border: 2px solid #FFA500; }
.check-overlay h2 { color: #FFD700; text-shadow: 0 0 10px rgba(255, 215, 0, 0.5); }

.checkmate-overlay { border: 2px solid #FF0000; }
.checkmate-overlay h2 { color: #FF4444; text-shadow: 0 0 10px rgba(255, 0, 0, 0.5); }

.stalemate-overlay { border: 2px solid #888; }
.stalemate-overlay h2 { color: #AAAAAA; }

.player-status-indicator {
  padding: 6px 12px;
  border-radius: 20px;
  background-color: var(--color-surface);
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  box-shadow: var(--shadow-sm);
}

.player-status-seated.player-status-white {
  border-left: 4px solid #f5f5f5;
}

.player-status-seated.player-status-black {
  border-left: 4px solid #212121;
}

.player-status-spectator {
  border-left: 4px solid gray;
}

.player-status-no-seat {
  border-left: 4px solid orange;
}

.spectators-info {
  font-size: 14px;
  color: var(--color-text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.share-table-btn {
  font-size: 13px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-primary, #cda350);
  background: transparent;
  color: var(--color-primary, #cda350);
  cursor: pointer;
}
.share-table-btn:hover { background: var(--color-primary, #cda350); color: #1c1c1e; }

.loading-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
}
</style>