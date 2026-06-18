// Test del adapter de ajedrez sobre el motor del lobby (funciones puras).
// Verifica que las reglas reales (chessRules) se mapean bien a reducer/isOver.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as rules from '../src/utils/chessRules.js'
import { makeChessEngine } from '../src/game/chessAdapter.js'

const spec = makeChessEngine({ ...rules, getAlgebraicNotation: () => '' })

function fresh () { return spec.initialState() }
const ctx = (seat) => ({ seat, now: 1000, rng: Math.random, seats: {} })
// row 0 = rank 8, row 7 = rank 1; col 0 = 'a'. f2=(6,5) g2=(6,6) e7=(1,4) d8=(0,3)
const sq = (col, rank) => ({ row: 8 - rank, col })

function move (state, seat, from, to) {
  return spec.reducer(state, { type: 'move', from, to }, ctx(seat))
}

test('estado inicial: turno blanco, tablero 8x8, sin historial', () => {
  const s = fresh()
  assert.equal(s.currentTurn, 'white')
  assert.equal(s.board.length, 8)
  assert.equal(s.moveHistory.length, 0)
  assert.equal(spec.isOver(s), null)
})

test('movimiento legal aplica y cambia el turno', () => {
  let s = fresh()
  s = move(s, 'white', sq('e'.charCodeAt(0) - 97, 2), sq('e'.charCodeAt(0) - 97, 4)) // e2-e4
  assert.equal(s.currentTurn, 'black')
  assert.equal(s.moveHistory.length, 1)
  assert.equal(s.board[8 - 4][4], 'P') // peón blanco en e4
  assert.equal(s.board[8 - 2][4], '')  // e2 vacío
})

test('rechaza mover fuera de turno y pieza ajena', () => {
  const s = fresh()
  assert.throws(() => move(s, 'black', sq(4, 7), sq(4, 5)), /not-your-turn/)
  // blancas intentando mover un peón negro
  assert.throws(() => move(s, 'white', sq(4, 7), sq(4, 5)), /not-your-piece/)
})

test('rechaza movimiento ilegal', () => {
  const s = fresh()
  assert.throws(() => move(s, 'white', sq(4, 2), sq(4, 6)), /illegal-move/) // e2-e6 (salto inválido)
})

test('fool\'s mate: jaque mate detectado por isOver', () => {
  let s = fresh()
  s = move(s, 'white', sq(5, 2), sq(5, 3)) // f2-f3
  s = move(s, 'black', sq(4, 7), sq(4, 5)) // e7-e5
  s = move(s, 'white', sq(6, 2), sq(6, 4)) // g2-g4
  assert.equal(spec.isOver(s), null)
  s = move(s, 'black', sq(3, 8), sq(7, 4)) // Dd8-h4#
  const over = spec.isOver(s)
  assert.ok(over, 'debe haber fin de partida')
  assert.equal(over.reason, 'checkmate')
  assert.equal(over.winner, 'black')
})

test('resign termina a favor del oponente', () => {
  let s = fresh()
  s = spec.reducer(s, { type: 'resign' }, ctx('white'))
  const over = spec.isOver(s)
  assert.deepEqual(over, { winner: 'black', reason: 'surrender' })
})
