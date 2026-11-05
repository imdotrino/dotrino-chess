// Formas de datos del ajedrez que se repiten entre reglas, motor y vistas.
// Solo tipos (JSDoc): este módulo no exporta nada en tiempo de ejecución.

/**
 * Pieza en notación de una letra: mayúscula = blanca, minúscula = negra
 * (k rey, q reina, r torre, b alfil, n caballo, p peón). `''` = casilla vacía.
 * @typedef {string} Piece
 */

/** Tablero 8×8; fila 0 = rank 8 (negras), fila 7 = rank 1 (blancas). @typedef {Piece[][]} Board */

/** @typedef {{ row: number, col: number }} Square */

/** Casilla de destino posible; `enPassant` marca la captura al paso. @typedef {Square & { enPassant?: boolean }} TargetSquare */

/**
 * Una jugada del historial.
 * @typedef {object} MoveRecord
 * @property {Square} from
 * @property {Square} to
 * @property {Piece} piece
 * @property {Piece} [captured]
 * @property {number} [timestamp]
 * @property {string} [notation]  notación algebraica (SAN)
 * @property {string} [turn]      color que movió
 */

/** Tiempo acumulado por color, en ms. @typedef {{ white: number, black: number, lastUpdate: number | null }} Timers */

/**
 * Estado del motor de ajedrez (la parte del juego; asientos y estado son del Room).
 * @typedef {object} ChessState
 * @property {Board} board
 * @property {string} currentTurn
 * @property {MoveRecord[]} moveHistory
 * @property {Timers} timers
 * @property {boolean} check
 * @property {string} [resignedBy]
 */

/**
 * Acción que un asiento manda al motor.
 * @typedef {object} ChessAction
 * @property {'move' | 'resign' | string} type
 * @property {Square} [from]
 * @property {Square} [to]
 * @property {Piece} [piece]
 * @property {Piece | null} [captured]
 */

/**
 * El rival que se enseña en el chip «vs» y en el modal de calificar.
 * @typedef {object} OpponentInfo
 * @property {string} token
 * @property {string | null} pubkey
 * @property {import('@dotrino/identity').PeerInfo | null} peer
 * @property {string | null} announcedNickname
 */

/**
 * Provider que la app inyecta en `<dotrino-profile>`. Añade `getDerived` (ELO por
 * juego), que el componente usa y su declaración (@dotrino/profile 0.20.1) no publica.
 * @typedef {import('@dotrino/profile').ProfileProvider & {
 *   getDerived?(pubkey: string, name: string, scope?: string): Promise<{ value: number, count: number } | null>
 * }} ChessProfileProvider
 */

export {}
