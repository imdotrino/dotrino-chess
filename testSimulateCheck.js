import { createInitialBoard, applyMove, isKingInCheck, isCheckmate, isStalemate, getValidMoves } from './src/utils/chessRules.js';

let board = createInitialBoard();
// Let's create a situation where white moves to put black in check
board[6][4] = ''; // e2
board[2][4] = 'Q'; // white queen on e6
console.log('Valid moves for white Queen at e6:', getValidMoves(board, 2, 4, 'Q', []).length);

// Move the queen to e7 to put black king in check
board = applyMove(board, 2, 4, 1, 4); // Queen at e7 check
let currentTurn = 'black';

console.log('Is checkmate?', isCheckmate(board, currentTurn));
console.log('Is stalemate?', isStalemate(board, currentTurn));
console.log('Is king in check?', isKingInCheck(board, currentTurn));

// What if the black king moves away?
console.log('Valid moves for black king:', getValidMoves(board, 0, 4, 'k', []).length);
