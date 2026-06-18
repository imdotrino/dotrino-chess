// Test de la captura al paso (en passant) en chessRules.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as r from '../src/utils/chessRules.js'

// row 0 = rank 8, row 7 = rank 1; col 0 = 'a'. Blancas 'P' (suben), negras 'p'.
function playSequence (moves) {
  let board = r.createInitialBoard()
  const hist = []
  for (const [fr, fc, tr, tc] of moves) {
    const piece = board[fr][fc]
    assert.ok(r.isValidMove(board, fr, fc, tr, tc, hist), `movimiento ilegal: ${fr},${fc}->${tr},${tc}`)
    board = r.applyMove(board, fr, fc, tr, tc)
    hist.push({ from: { row: fr, col: fc }, to: { row: tr, col: tc }, piece })
  }
  return { board, hist }
}

test('en passant: captura válida y remueve el peón', () => {
  // 1.e4 a6 2.e5 d5  → el peón blanco en e5 (3,4) puede capturar al paso en d6 (2,3)
  const { board, hist } = playSequence([
    [6, 4, 4, 4], // e2-e4
    [1, 0, 2, 0], // a7-a6
    [4, 4, 3, 4], // e4-e5
    [1, 3, 3, 3]  // d7-d5 (doble, al lado de e5)
  ])
  assert.equal(board[3][3], 'p', 'el peón negro está en d5')

  assert.ok(r.isValidMove(board, 3, 4, 2, 3, hist), 'en passant debe ser legal justo después del doble paso')
  const after = r.applyMove(board, 3, 4, 2, 3)
  assert.equal(after[2][3], 'P', 'el peón blanco avanzó a d6')
  assert.equal(after[3][4], '', 'e5 quedó vacío')
  assert.equal(after[3][3], '', 'el peón negro capturado fue removido')
})

test('en passant: NO se permite si no es inmediatamente después del doble paso', () => {
  // Igual que antes, pero con una jugada intermedia (g) → se pierde el derecho.
  const { board, hist } = playSequence([
    [6, 4, 4, 4], // e4
    [1, 0, 2, 0], // a6
    [4, 4, 3, 4], // e5
    [1, 3, 3, 3], // d5 (doble)
    [6, 6, 5, 6], // g3 (blancas, jugada intermedia)
    [2, 0, 3, 0]  // a5 (negras)
  ])
  assert.ok(!r.isValidMove(board, 3, 4, 2, 3, hist), 'en passant ya no debe permitirse tras una jugada intermedia')
})

test('en passant: la captura diagonal normal sigue funcionando', () => {
  // Aseguramos no haber roto capturas normales: 1.e4 d5 2.exd5
  const { board } = playSequence([
    [6, 4, 4, 4], // e4
    [1, 3, 3, 3]  // d5
  ])
  const after = r.applyMove(board, 4, 4, 3, 3) // exd5 (captura normal)
  assert.equal(after[3][3], 'P', 'peón blanco capturó en d5')
  assert.equal(after[4][4], '', 'e4 vacío')
})
