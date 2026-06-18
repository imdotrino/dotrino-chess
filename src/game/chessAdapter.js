// Adapter de ajedrez para @dotrino/lobby.
//
// Convierte las reglas puras de chessRules.js en el `engine spec` que espera el
// motor de turnos del lobby: { initialState, reducer, view, isOver }. El lobby se
// encarga de asientos, espectadores, presencia, reconexión, sync y broadcast; acá
// SÓLO viven las reglas del ajedrez. Esto reemplaza todo el protocolo WS casero +
// versioning + host/playerGameStore (deuda que CLAUDE.md manda migrar al paquete).
//
// Es una FACTORÍA con dependencias inyectadas (sin imports) para poder testearla
// con node y reusar las mismas funciones de la app (chessRules + getAlgebraicNotation).
//
//   import * as rules from '@/utils/chessRules'
//   import { getAlgebraicNotation } from '@/stores/sharedGameLogic'
//   const engine = makeChessEngine({ ...rules, getAlgebraicNotation })
//   const lobby = await createLobby({ gameId:'chess', seats:['white','black'], engine, ... })

/** ¿La pieza pertenece al color dado? (mayúscula=blanca, minúscula=negra). */
function pieceOwnedBy (piece, color) {
  if (!piece) return false
  return color === 'white' ? piece === piece.toUpperCase() : piece === piece.toLowerCase()
}

export function makeChessEngine (rules) {
  const {
    createInitialBoard, isValidMove, applyMove,
    isCheckmate, isStalemate, isKingInCheck, COLORS,
    getAlgebraicNotation
  } = rules
  const WHITE = (COLORS && COLORS.WHITE) || 'white'
  const BLACK = (COLORS && COLORS.BLACK) || 'black'

  return {
    // El estado del motor = SÓLO la parte de ajedrez. seats/status/result son del Room.
    initialState: () => ({
      board: createInitialBoard(),
      currentTurn: WHITE,
      moveHistory: [],
      timers: { white: 0, black: 0, lastUpdate: null }, // lastUpdate se siembra en el 1er move
      check: false
    }),

    // ctx = { seat, seats, rng, now }. seat ∈ {'white','black'} (= ids de asiento).
    reducer (state, action, ctx) {
      if (!action) throw new Error('no-action')

      if (action.type === 'resign') {
        return { ...state, resignedBy: ctx.seat }
      }
      if (action.type !== 'move') throw new Error('unknown-action')
      if (ctx.seat !== state.currentTurn) throw new Error('not-your-turn')

      const { from, to } = action
      if (!from || !to) throw new Error('bad-move')
      const piece = state.board[from.row][from.col]
      if (!piece) throw new Error('empty-square')
      if (!pieceOwnedBy(piece, ctx.seat)) throw new Error('not-your-piece')
      if (!isValidMove(state.board, from.row, from.col, to.row, to.col, state.moveHistory)) {
        throw new Error('illegal-move')
      }

      // Cronómetros: acumular el tiempo del que movía (igual que el host actual).
      const timers = { ...state.timers }
      if (timers.lastUpdate != null) timers[state.currentTurn] += ctx.now - timers.lastUpdate
      timers.lastUpdate = ctx.now

      const oldBoard = state.board
      const newBoard = applyMove(oldBoard, from.row, from.col, to.row, to.col) // arity 5: sin `piece`
      const captured = action.captured != null ? action.captured : (oldBoard[to.row][to.col] || '')
      const moveData = { from, to, piece, captured, timestamp: ctx.now }
      const notation = getAlgebraicNotation ? getAlgebraicNotation(moveData, oldBoard, newBoard) : ''
      const moveHistory = [...state.moveHistory, { ...moveData, notation, turn: state.currentTurn }]

      const nextTurn = state.currentTurn === WHITE ? BLACK : WHITE
      return {
        board: newBoard,
        currentTurn: nextTurn,
        moveHistory,
        timers,
        check: isKingInCheck(newBoard, nextTurn)
      }
    },

    // Ajedrez = información perfecta: misma vista para todos los asientos/espectadores.
    view: (state) => state,

    // El lobby lo consulta tras cada apply; el resultado va a RoomState.result.
    isOver (state) {
      if (state.resignedBy) {
        return { winner: state.resignedBy === WHITE ? BLACK : WHITE, reason: 'surrender' }
      }
      const c = state.currentTurn // al que le toca y (quizá) no puede mover
      if (isCheckmate(state.board, c)) {
        return { winner: c === WHITE ? BLACK : WHITE, reason: 'checkmate' }
      }
      if (isStalemate(state.board, c)) {
        return { winner: null, reason: 'stalemate' }
      }
      return null
    }
  }
}
