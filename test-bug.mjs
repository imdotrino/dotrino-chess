import * as chessRules from './src/utils/chessRules.js'

let board = chessRules.createInitialBoard()
board = chessRules.applyMove(board, 6, 4, 4, 4) // e2-e4
board = chessRules.applyMove(board, 1, 3, 3, 3) // d7-d5
board = chessRules.applyMove(board, 7, 5, 3, 1) // f1-b5

// Check valid moves for Black Queen (d8) -> which is row 0, col 3.
console.log("Moves for Black Queen:")
console.log(chessRules.getValidMoves(board, 0, 3, 'q', []))

// Check valid moves for Black Pawn c7 (row 1, col 2)
console.log("Moves for Black Pawn:")
console.log(chessRules.getValidMoves(board, 1, 2, 'p', []))
