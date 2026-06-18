// gameStore — shim sobre lobbyController. API neutral de juego (sin bifurcar
// host/guest, eso lo resuelve el lobby).
import { defineStore } from 'pinia'
import { lobbyController as c } from './lobbyController'

export const useGameStore = defineStore('game', () => ({
  // estado
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
  isHost: c.isHost,
  winner: c.winner,
  // getters
  isMyTurn: c.isMyTurn,
  isSeated: c.isSeated,
  mySeatColor: c.mySeatColor,
  isSpectator: c.isSpectator,
  bothSeatsOccupied: c.bothSeatsOccupied,
  availableSeats: c.availableSeats,
  spectatorsCount: c.spectatorsCount,
  // acciones
  selectPiece: c.selectPiece,
  movePiece: c.makeMove,
  makeMove: c.makeMove,
  takeSeat: c.takeSeat,
  occupySeat: (color) => c.takeSeat(color),
  leaveSeat: c.leaveSeat,
  surrender: c.surrender,
  startGame: c.startGame,
  resetGame: c.resetGame
}))
