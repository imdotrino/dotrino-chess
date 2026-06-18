// Utilidades para reglas básicas del ajedrez
// Esta es una implementación simplificada para el MVP

// Notación de piezas:
// Mayúsculas = blancas, Minúsculas = negras
// R/r: Torre, N/n: Caballo, B/b: Alfil, Q/q: Reina, K/k: Rey, P/p: Peón

export const PIECE_TYPES = {
  KING: 'k',
  QUEEN: 'q',
  ROOK: 'r',
  BISHOP: 'b',
  KNIGHT: 'n',
  PAWN: 'p'
}

export const COLORS = {
  WHITE: 'white',
  BLACK: 'black'
}

// Convertir pieza a color
export function getPieceColor(piece) {
  if (!piece) return null
  return piece === piece.toUpperCase() ? COLORS.WHITE : COLORS.BLACK
}

// Convertir pieza a tipo
export function getPieceType(piece) {
  if (!piece) return null
  return piece.toLowerCase()
}

// Verificar si una pieza es del color especificado
export function isPieceColor(piece, color) {
  if (!piece) return false
  return getPieceColor(piece) === color
}

// Verifica si una pieza se ha movido alguna vez desde su origen
export function hasPieceMoved(moveHistory, row, col) {
  if (!moveHistory || moveHistory.length === 0) return false
  return moveHistory.some(m => m.from.row === row && m.from.col === col)
}

// Obtener todos los movimientos totalmente válidos (protegen al rey)
export function getValidMoves(board, row, col, piece, moveHistory = []) {
  if (!piece) return []
  
  const pieceColor = getPieceColor(piece)
  const pseudoLegalMoves = getPseudoLegalMoves(board, row, col, piece, moveHistory)
  const strictLegalMoves = []
  
  for (const move of pseudoLegalMoves) {
    // Simular el movimiento
    const tempBoard = applyMove(board, row, col, move.row, move.col)
    
    // Si el movimiento NO deja a nuestro propio rey en jaque, es legal
    if (!isKingInCheck(tempBoard, pieceColor)) {
      strictLegalMoves.push(move)
    }
  }
  
  return strictLegalMoves
}

// Obtener movimientos pseudo-legales (ignora la seguridad del rey)
export function getPseudoLegalMoves(board, row, col, piece, moveHistory = [], checkCastling = true) {
  if (!piece) return []
  
  const pieceType = getPieceType(piece)
  const pieceColor = getPieceColor(piece)
  
  switch (pieceType) {
    case PIECE_TYPES.PAWN:
      return getPawnMoves(board, row, col, pieceColor, moveHistory)
    case PIECE_TYPES.KNIGHT:
      return getKnightMoves(board, row, col, pieceColor)
    case PIECE_TYPES.BISHOP:
      return getBishopMoves(board, row, col, pieceColor)
    case PIECE_TYPES.ROOK:
      return getRookMoves(board, row, col, pieceColor)
    case PIECE_TYPES.QUEEN:
      return getQueenMoves(board, row, col, pieceColor)
    case PIECE_TYPES.KING:
      return getKingMoves(board, row, col, pieceColor, moveHistory, checkCastling)
    default:
      return []
  }
}

// Movimientos del peón
function getPawnMoves(board, row, col, color, moveHistory = []) {
  const moves = []
  const direction = color === COLORS.WHITE ? -1 : 1 // Blancas suben, negras bajan
  const startRow = color === COLORS.WHITE ? 6 : 1
  
  // Movimiento hacia adelante (una casilla)
  const forwardRow = row + direction
  if (isValidPosition(forwardRow, col) && !board[forwardRow][col]) {
    moves.push({ row: forwardRow, col })
    
    // Movimiento doble desde posición inicial
    if (row === startRow) {
      const doubleRow = row + (direction * 2)
      if (isValidPosition(doubleRow, col) && !board[doubleRow][col] && !board[forwardRow][col]) {
        moves.push({ row: doubleRow, col })
      }
    }
  }
  
  // Capturas diagonales
  for (const dc of [-1, 1]) {
    const captureCol = col + dc
    const captureRow = row + direction
    
    if (isValidPosition(captureRow, captureCol)) {
      const targetPiece = board[captureRow][captureCol]
      if (targetPiece && getPieceColor(targetPiece) !== color) {
        moves.push({ row: captureRow, col: captureCol })
      }
    }
  }
  
  // Captura al paso (en passant): si el último movimiento fue un peón rival que
  // avanzó dos casillas y quedó al lado nuestro, podemos capturarlo en diagonal
  // a la casilla que "saltó".
  const last = moveHistory && moveHistory.length ? moveHistory[moveHistory.length - 1] : null
  if (last && last.piece && last.from && last.to &&
      getPieceType(last.piece) === PIECE_TYPES.PAWN &&
      getPieceColor(last.piece) !== color &&
      Math.abs(last.to.row - last.from.row) === 2 &&
      last.to.row === row && Math.abs(last.to.col - col) === 1) {
    const epRow = row + direction
    const epCol = last.to.col
    if (isValidPosition(epRow, epCol) && !board[epRow][epCol]) {
      moves.push({ row: epRow, col: epCol, enPassant: true })
    }
  }

  return moves
}

// Movimientos del caballo (en L)
function getKnightMoves(board, row, col, color) {
  const moves = []
  const knightMoves = [
    { dr: -2, dc: -1 }, { dr: -2, dc: 1 },
    { dr: -1, dc: -2 }, { dr: -1, dc: 2 },
    { dr: 1, dc: -2 }, { dr: 1, dc: 2 },
    { dr: 2, dc: -1 }, { dr: 2, dc: 1 }
  ]
  
  for (const move of knightMoves) {
    const newRow = row + move.dr
    const newCol = col + move.dc
    
    if (isValidPosition(newRow, newCol)) {
      const targetPiece = board[newRow][newCol]
      if (!targetPiece || getPieceColor(targetPiece) !== color) {
        moves.push({ row: newRow, col: newCol })
      }
    }
  }
  
  return moves
}

// Movimientos del alfil (diagonales)
function getBishopMoves(board, row, col, color) {
  const moves = []
  const directions = [
    { dr: -1, dc: -1 }, // Arriba-izquierda
    { dr: -1, dc: 1 },  // Arriba-derecha
    { dr: 1, dc: -1 },  // Abajo-izquierda
    { dr: 1, dc: 1 }    // Abajo-derecha
  ]
  
  for (const dir of directions) {
    let currentRow = row + dir.dr
    let currentCol = col + dir.dc
    
    while (isValidPosition(currentRow, currentCol)) {
      const targetPiece = board[currentRow][currentCol]
      
      if (!targetPiece) {
        // Casilla vacía
        moves.push({ row: currentRow, col: currentCol })
      } else {
        // Pieza en la casilla
        if (getPieceColor(targetPiece) !== color) {
          moves.push({ row: currentRow, col: currentCol })
        }
        break // No podemos saltar sobre piezas
      }
      
      currentRow += dir.dr
      currentCol += dir.dc
    }
  }
  
  return moves
}

// Movimientos de la torre (horizontal/vertical)
function getRookMoves(board, row, col, color) {
  const moves = []
  const directions = [
    { dr: -1, dc: 0 }, // Arriba
    { dr: 1, dc: 0 },  // Abajo
    { dr: 0, dc: -1 }, // Izquierda
    { dr: 0, dc: 1 }   // Derecha
  ]
  
  for (const dir of directions) {
    let currentRow = row + dir.dr
    let currentCol = col + dir.dc
    
    while (isValidPosition(currentRow, currentCol)) {
      const targetPiece = board[currentRow][currentCol]
      
      if (!targetPiece) {
        moves.push({ row: currentRow, col: currentCol })
      } else {
        if (getPieceColor(targetPiece) !== color) {
          moves.push({ row: currentRow, col: currentCol })
        }
        break
      }
      
      currentRow += dir.dr
      currentCol += dir.dc
    }
  }
  
  return moves
}

// Movimientos de la reina (combinación de alfil y torre)
function getQueenMoves(board, row, col, color) {
  const bishopMoves = getBishopMoves(board, row, col, color)
  const rookMoves = getRookMoves(board, row, col, color)
  return [...bishopMoves, ...rookMoves]
}

// Movimientos del rey (una casilla en cualquier dirección + enroque)
function getKingMoves(board, row, col, color, moveHistory = [], checkCastling = true) {
  const moves = []
  const kingMoves = [
    { dr: -1, dc: -1 }, { dr: -1, dc: 0 }, { dr: -1, dc: 1 },
    { dr: 0, dc: -1 },                     { dr: 0, dc: 1 },
    { dr: 1, dc: -1 },  { dr: 1, dc: 0 },  { dr: 1, dc: 1 }
  ]
  
  for (const move of kingMoves) {
    const newRow = row + move.dr
    const newCol = col + move.dc
    
    if (isValidPosition(newRow, newCol)) {
      const targetPiece = board[newRow][newCol]
      if (!targetPiece || getPieceColor(targetPiece) !== color) {
        moves.push({ row: newRow, col: newCol })
      }
    }
  }
  
  // Enroque (Castling)
  if (checkCastling && !hasPieceMoved(moveHistory, row, col)) {
    // Para blancas: fila 7. Para negras: fila 0.
    const expectedRow = color === COLORS.WHITE ? 7 : 0
    if (row === expectedRow && col === 4) {
      // El rey no debe estar en jaque al iniciar el enroque
      if (!isKingInCheck(board, color)) {
        
        // Enroque corto (Kingside) - Torre en col 7 (h1/h8)
        if (!hasPieceMoved(moveHistory, expectedRow, 7) && board[expectedRow][7] && getPieceColor(board[expectedRow][7]) === color && getPieceType(board[expectedRow][7]) === PIECE_TYPES.ROOK) {
          // Casillas libres entre Rey y Torre
          if (!board[expectedRow][5] && !board[expectedRow][6]) {
            // El rey no puede pasar por jaque (casilla 5)
            const tempBoard = applyMove(board, row, col, expectedRow, 5)
            if (!isKingInCheck(tempBoard, color)) {
              moves.push({ row: expectedRow, col: 6 }) // Destino final comprobado en getValidMoves
            }
          }
        }
        
        // Enroque largo (Queenside) - Torre en col 0 (a1/a8)
        if (!hasPieceMoved(moveHistory, expectedRow, 0) && board[expectedRow][0] && getPieceColor(board[expectedRow][0]) === color && getPieceType(board[expectedRow][0]) === PIECE_TYPES.ROOK) {
          // Casillas libres entre Rey y Torre
          if (!board[expectedRow][1] && !board[expectedRow][2] && !board[expectedRow][3]) {
            // El rey no puede pasar por jaque (casilla 3)
            const tempBoard = applyMove(board, row, col, expectedRow, 3)
            if (!isKingInCheck(tempBoard, color)) {
              moves.push({ row: expectedRow, col: 2 }) // Destino final comprobado en getValidMoves
            }
          }
        }
      }
    }
  }
  
  return moves
}

// Verificar si una posición está dentro del tablero
function isValidPosition(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8
}

// Verificar si un movimiento es válido
export function isValidMove(board, fromRow, fromCol, toRow, toCol, moveHistory = []) {
  const piece = board[fromRow][fromCol]
  if (!piece) return false
  
  const validMoves = getValidMoves(board, fromRow, fromCol, piece, moveHistory)
  return validMoves.some(move => move.row === toRow && move.col === toCol)
}

// Aplicar un movimiento al tablero
export function applyMove(board, fromRow, fromCol, toRow, toCol) {
  const newBoard = board.map(row => [...row])
  const piece = newBoard[fromRow][fromCol]
  
  if (!piece) return board
  
  // Mover la pieza al destino
  newBoard[toRow][toCol] = piece
  newBoard[fromRow][fromCol] = ''
  
  // TODO: Implementar promoción de peón
  // Implementar Enroque Automático (Si el rey se movió horizontalmente 2 casillas)
  if (getPieceType(piece) === PIECE_TYPES.KING && Math.abs(toCol - fromCol) === 2) {
    if (toCol === 6) { // Enroque corto (Columna G)
      newBoard[fromRow][5] = newBoard[fromRow][7] // Mover torre a la casilla 5
      newBoard[fromRow][7] = '' // Limpiar casilla 7 original
    } else if (toCol === 2) { // Enroque largo (Columna C)
      newBoard[fromRow][3] = newBoard[fromRow][0] // Mover torre a la casilla 3
      newBoard[fromRow][0] = '' // Limpiar casilla 0 original
    }
  }
  
  // Captura al paso: un peón que se mueve en diagonal hacia una casilla que
  // estaba vacía sólo puede ser en passant → el peón capturado quedó en la fila
  // de origen, en la columna de destino.
  if (getPieceType(piece) === PIECE_TYPES.PAWN && fromCol !== toCol && !board[toRow][toCol]) {
    newBoard[fromRow][toCol] = ''
  }

  return newBoard
}

// Verificar si el rey está en jaque
export function isKingInCheck(board, color) {
  // Encontrar la posición del rey
  let kingRow = -1
  let kingCol = -1
  const kingPiece = color === COLORS.WHITE ? 'K' : 'k'
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (board[row][col] === kingPiece) {
        kingRow = row
        kingCol = col
        break
      }
    }
    if (kingRow !== -1) break
  }
  
  if (kingRow === -1) return false // Rey no encontrado (no debería pasar)
  
  // Verificar si alguna pieza del oponente puede capturar al rey
  const opponentColor = color === COLORS.WHITE ? COLORS.BLACK : COLORS.WHITE
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col]
      if (piece && getPieceColor(piece) === opponentColor) {
        // Pasa checkCastling=false para evitar recursividad infinita
        // ya que getValidMoves/getKingMoves evalúa isKingInCheck para el enroque
        const moves = getPseudoLegalMoves(board, row, col, piece, [], false)
        if (moves.some(move => move.row === kingRow && move.col === kingCol)) {
          return true
        }
      }
    }
  }
  
  return false
}

// Retorna todos los movimientos legales posibles de un jugador (Para mate/ahogado)
export function getTotalValidMoves(board, color, moveHistory = []) {
  let count = 0
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col]
      if (piece && getPieceColor(piece) === color) {
        count += getValidMoves(board, row, col, piece, moveHistory).length
      }
    }
  }
  return count
}

// Verificar si el rey está en jaque mate
export function isCheckmate(board, color, moveHistory = []) {
  // Primero verificar si el rey está en jaque
  if (!isKingInCheck(board, color)) {
    return false
  }
  
  // Como getValidMoves ahora filtra movimientos que dejan el rey en jaque,
  // si estamos en jaque y no hay movimientos válidos, es mate.
  return getTotalValidMoves(board, color, moveHistory) === 0
}

// Verificar tablas (stalemate - ahogado)
export function isStalemate(board, color, moveHistory = []) {
  // Para que sea ahogado, el rey NO debe estar en jaque
  if (isKingInCheck(board, color)) {
    return false
  }
  
  // Y el jugador no tiene ningún movimiento legal disponible
  return getTotalValidMoves(board, color, moveHistory) === 0
}

// Crear tablero inicial
export function createInitialBoard() {
  return [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'], // fila 8 (negras)
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'], // fila 7
    ['', '', '', '', '', '', '', ''], // fila 6
    ['', '', '', '', '', '', '', ''], // fila 5
    ['', '', '', '', '', '', '', ''], // fila 4
    ['', '', '', '', '', '', '', ''], // fila 3
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'], // fila 2 (blancas)
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']  // fila 1
  ]
}

// Convertir notación algebraica a coordenadas
export function algebraicToCoordinates(algebraic) {
  if (algebraic.length < 2) return null
  
  const file = algebraic[0].toLowerCase()
  const rank = parseInt(algebraic[1])
  
  if (!file || !rank || rank < 1 || rank > 8) return null
  
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const fileIndex = files.indexOf(file)
  
  if (fileIndex === -1) return null
  
  // Convertir rank a índice de fila (rank 8 = fila 0, rank 1 = fila 7)
  const row = 8 - rank
  const col = fileIndex
  
  return { row, col }
}

// Convertir coordenadas a notación algebraica
export function coordinatesToAlgebraic(row, col) {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const rank = 8 - row
  
  if (row < 0 || row > 7 || col < 0 || col > 7) return null
  
  return files[col] + rank
}