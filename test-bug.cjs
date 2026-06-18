const chessRules = require('./src/utils/chessRules.js')

// A simple script to reproduce "f1b5" bug 
const board = chessRules.createInitialBoard()
chessRules.applyMove(board, 6, 4, 4, 4) // e2-e4
chessRules.applyMove(board, 1, 3, 3, 3) // d7-d5
chessRules.applyMove(board, 7, 5, 3, 1) // f1-b5

// Check valid moves for Black Queen (d8) -> which is row 0, col 3.
console.log("Moves for Black Queen:")
console.log(chessRules.getValidMoves(board, 0, 3, 'q', []))

console.log("Moves for Black Pawn c7 (row 1, col 2):")
console.log(chessRules.getValidMoves(board, 1, 2, 'p', []))
