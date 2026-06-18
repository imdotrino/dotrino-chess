// playerGameStore — shim sobre lobbyController. Conserva los nombres de guest
// (requestSeat/requestLeaveSeat/resetLocalGame/...) que usan los componentes.
import { defineStore } from 'pinia'
import { lobbyController as c } from './lobbyController'

export const usePlayerGameStore = defineStore('playerGame', () => ({
  // estado de juego
  board: c.board,
  currentTurn: c.currentTurn,
  selectedPiece: c.selectedPiece,
  validMoves: c.validMoves,
  gameStatus: c.gameStatus,
  moveHistory: c.moveHistory,
  playerColor: c.playerColor,
  seats: c.seats,
  spectators: c.spectators,
  timers: c.timers,
  bothSeatsOccupied: c.bothSeatsOccupied,
  availableSeats: c.availableSeats,
  spectatorsCount: c.spectatorsCount,
  // getters de guest
  isSeated: c.isSeated,
  mySeatColor: c.mySeatColor,
  isSpectator: c.isSpectator,
  isMyTurn: c.isMyTurn,
  // acciones de guest
  selectPiece: c.selectPiece,
  makeMove: c.makeMove,
  requestSeat: c.takeSeat,
  requestLeaveSeat: c.leaveSeat,
  resetLocalGame: c.resetGame,
  surrender: c.surrender,
  requestFullState: () => {} // no-op: el lobby sincroniza solo
}))
