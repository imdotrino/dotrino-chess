// hostGameStore — shim sobre lobbyController. Conserva los nombres "...AsHost"
// que usan los componentes; debajo es el mismo store único del lobby.
import { defineStore } from 'pinia'
import { lobbyController as c } from './lobbyController'

export const useHostGameStore = defineStore('hostGame', () => ({
  // estado de juego (igual que la API neutral)
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
  // getters específicos de host (alias)
  isHostPlaying: c.isSeated,
  hostAsPlayerColor: c.mySeatColor,
  isHostTurn: c.isMyTurn,
  // acciones (alias "...AsHost")
  selectPieceAsHost: c.selectPiece,
  makeMoveAsHost: c.makeMove,
  occupySeatAsHost: c.takeSeat,
  leaveSeatAsHost: c.leaveSeat,
  resetGame: c.resetGame,
  destroyHostInstance: c.destroyHostInstance,
  // util usada por gameStore viejo / tests
  getSeatColorByToken: () => null
}))
