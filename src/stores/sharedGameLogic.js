// Lógica de juego compartida entre host y player
// Exporta constantes, funciones de utilidad y tipos comunes

// Importar desde chessRules.js para uso local y re-exportar
import {
  createInitialBoard,
  getValidMoves,
  isValidMove,
  applyMove,
  isKingInCheck,
  isCheckmate,
  isStalemate,
  coordinatesToAlgebraic,
  COLORS
} from '@/utils/chessRules'

// Re-exportar las mismas funciones
export {
  createInitialBoard,
  getValidMoves,
  isValidMove,
  applyMove,
  isKingInCheck,
  isCheckmate,
  isStalemate,
  coordinatesToAlgebraic,
  COLORS
}

// Constantes adicionales para el juego
export const PIECE_TYPES = {
  PAWN: 'pawn',
  ROOK: 'rook',
  KNIGHT: 'knight',
  BISHOP: 'bishop',
  QUEEN: 'queen',
  KING: 'king'
}

// Tipos de mensajes WebSocket para comunicación de juego
export const MESSAGE_TYPES = {
  // Mensajes de player a host (directos)
  SEAT_REQUEST: 'SEAT_REQUEST',
  MOVE: 'MOVE',
  LEAVE_SEAT: 'LEAVE_SEAT',
  CHAT_MESSAGE: 'CHAT_MESSAGE',
  SURRENDER: 'SURRENDER',
  // Solicitud de estado completo (guest → host, cuando se conecta o detecta desync)
  REQUEST_FULL_STATE: 'REQUEST_FULL_STATE',
  
  // Mensajes de host a players (broadcast)
  GAME_STATE_UPDATE: 'GAME_STATE_UPDATE',
  MOVE_APPLIED: 'MOVE_APPLIED',
  SEATS_UPDATE: 'SEATS_UPDATE',
  GAME_START: 'GAME_START',
  GAME_START_AUTO: 'GAME_START_AUTO',
  GAME_END: 'GAME_END',
  PLAYER_JOINED_LEFT: 'PLAYER_JOINED_LEFT',
  SPECTATOR_JOINED: 'SPECTATOR_JOINED',
  SPECTATOR_LEFT: 'SPECTATOR_LEFT',
  SEAT_OCCUPIED: 'SEAT_OCCUPIED',
  SEAT_VACATED: 'SEAT_VACATED',
  // Respuesta al REQUEST_FULL_STATE (host → guest solicitante, no broadcast)
  FULL_STATE_RESPONSE: 'FULL_STATE_RESPONSE'
}

// Estados posibles del juego
export const GAME_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  CHECK: 'check',
  CHECKMATE: 'checkmate',
  STALEMATE: 'stalemate',
  FINISHED: 'finished',
  PAUSED: 'paused'
}

// Tipos de asientos
export const SEAT_COLORS = {
  WHITE: 'white',
  BLACK: 'black'
}

// Estructura de datos para un movimiento
/**
 * @typedef {Object} MoveData
 * @property {Object} from - Posición de origen {row: number, col: number}
 * @property {Object} to - Posición de destino {row: number, col: number}
 * @property {string} piece - Pieza que se mueve (ej. 'P', 'r', 'Q', etc.)
 * @property {number} timestamp - Timestamp del movimiento
 * @property {string} [playerToken] - Token del jugador que hizo el movimiento
 */

// Estructura de datos para estado del juego
/**
 * @typedef {Object} GameState
 * @property {string[][]} board - Tablero 8x8
 * @property {string} currentTurn - 'white' o 'black'
 * @property {string} gameStatus - Estado del juego (ver GAME_STATUS)
 * @property {MoveData[]} moveHistory - Historial de movimientos
 * @property {Object} seats - Estado de los asientos
 * @property {string[]} spectators - Lista de tokens de espectadores
 * @property {Object} timers - Estado de los cronómetros en ms
 */

// Estructura de datos para asientos
/**
 * @typedef {Object} SeatState
 * @property {boolean} occupied - Si el asiento está ocupado
 * @property {string|null} playerToken - Token del jugador ocupante
 * @property {string|null} playerName - Nombre del jugador
 */

/**
 * @typedef {Object} SeatsState
 * @property {SeatState} white - Asiento de las blancas
 * @property {SeatState} black - Asiento de las negras
 */

// Funciones de utilidad compartidas

export function getAlgebraicNotation(moveData, boardBefore = null, boardAfter = null) {
  const { from, to, piece, captured } = moveData
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1']
  
  const fromFile = files[from.col]
  const fromRank = ranks[from.row]
  const toFile = files[to.col]
  const toRank = ranks[to.row]
  
  // Castling
  if (piece.toLowerCase() === 'k' && Math.abs(to.col - from.col) === 2) {
    if (to.col > from.col) return 'O-O'
    return 'O-O-O'
  }
  
  let notation = ''
  
  // Piece
  if (piece.toLowerCase() !== 'p') {
    notation += piece.toUpperCase()
    
    // Disambiguation
    if (boardBefore) {
      const samePieces = []
      const pColor = piece === piece.toUpperCase() ? COLORS.WHITE : COLORS.BLACK
      
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (r === from.row && c === from.col) continue
          if (boardBefore[r][c] === piece) {
             if (isValidMoveForPlayer(boardBefore, {row: r, col: c}, to, piece, pColor)) {
               samePieces.push({row: r, col: c})
             }
          }
        }
      }
      
      if (samePieces.length > 0) {
        const sameFile = samePieces.some(p => p.col === from.col)
        const sameRank = samePieces.some(p => p.row === from.row)
        
        if (!sameFile) {
          notation += fromFile
        } else if (!sameRank) {
          notation += fromRank
        } else {
          notation += fromFile + fromRank
        }
      }
    }
  } else {
    // Pawn
    if (captured) {
      notation += fromFile
    }
  }
  
  if (captured) notation += 'x'
  notation += toFile + toRank
  
  // Check/Checkmate
  if (boardAfter) {
     const pColor = piece === piece.toUpperCase() ? COLORS.WHITE : COLORS.BLACK
     const oppColor = pColor === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE
     
     if (isCheckmate(boardAfter, oppColor)) {
       notation += '#'
     } else if (isKingInCheck(boardAfter, oppColor)) {
       notation += '+'
     }
  }
  
  return notation
}

/**
 * Crea un objeto de versión de estado con un contador de secuencia y timestamp.
 * Usado para detectar desync entre host y guests.
 * @param {number} seq - Número de secuencia (default 0)
 * @returns {{ seq: number, ts: number }}
 */
export function createVersion(seq = 0) {
  return { seq, ts: Date.now() }
}

/**
 * Crea un estado inicial de asientos
 * @returns {SeatsState}
 */
export function createInitialSeats() {
  return {
    white: {
      occupied: false,
      playerToken: null,
      playerName: null
    },
    black: {
      occupied: false,
      playerToken: null,
      playerName: null
    }
  }
}

/**
 * Verifica si un movimiento es válido para el jugador actual
 * @param {string[][]} board - Tablero actual
 * @param {Object} from - Posición de origen {row, col}
 * @param {Object} to - Posición de destino {row, col}
 * @param {string} piece - Pieza que se mueve
 * @param {string} playerColor - Color del jugador ('white' o 'black')
 * @returns {boolean}
 */
export function isValidMoveForPlayer(board, from, to, piece, playerColor, moveHistory = []) {
  // Verificar que la pieza sea del color correcto
  if (playerColor === 'white' && piece === piece.toLowerCase()) {
    return false // Pieza negra cuando el jugador es blanco
  }
  if (playerColor === 'black' && piece === piece.toUpperCase()) {
    return false // Pieza blanca cuando el jugador es negro
  }
  
  // Usar la función de validación de chessRules
  return isValidMove(board, from.row, from.col, to.row, to.col, moveHistory)
}

/**
 * Formatea un mensaje para WebSocket
 * @param {string} type - Tipo de mensaje (de MESSAGE_TYPES)
 * @param {Object} data - Datos del mensaje
 * @returns {string} Mensaje formateado "TYPE|JSON_DATA"
 */
export function formatWebSocketMessage(type, data) {
  return `${type}|${JSON.stringify(data)}`
}

/**
 * Parsea un mensaje de WebSocket
 * @param {string} message - Mensaje en formato "TYPE|JSON_DATA"
 * @returns {Object} {type: string, data: Object}
 */
export function parseWebSocketMessage(message) {
  const [type, jsonData] = message.split('|')
  try {
    const data = JSON.parse(jsonData)
    return { type, data }
  } catch (error) {
    console.error('Error parseando mensaje WebSocket:', error, message)
    return { type, data: {} }
  }
}

/**
 * Crea un estado inicial completo del juego
 * @returns {GameState}
 */
export function createInitialGameState() {
  return {
    board: createInitialBoard(),
    currentTurn: COLORS.WHITE,
    gameStatus: GAME_STATUS.WAITING,
    moveHistory: [],
    seats: createInitialSeats(),
    spectators: [],
    timers: { white: 0, black: 0, lastUpdate: Date.now() }
  }
}