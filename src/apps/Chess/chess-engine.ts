/*
 * chess-engine.ts  –  Minimal chess engine for JuniOS
 *
 * Handles board state, legal‑move generation (including castling,
 * en-passant, promotion), check / checkmate / stalemate detection.
 */

export type Color = 'w' | 'b';
export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
export interface Piece { color: Color; type: PieceType; }
export type Square = Piece | null;
export type Board = Square[][];

export interface Move {
  fromR: number; fromC: number;
  toR: number; toC: number;
  capture?: Piece;
  promotion?: PieceType;
  castle?: 'K' | 'Q';
  enPassant?: boolean;
}

export interface GameState {
  board: Board;
  turn: Color;
  castling: { w: { K: boolean; Q: boolean }; b: { K: boolean; Q: boolean } };
  enPassantTarget: { r: number; c: number } | null;
  moveHistory: Move[];
  halfMoveClock: number;
  fullMoveNumber: number;
  status: 'playing' | 'checkmate' | 'stalemate' | 'draw';
}

const PIECE_UNICODE: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

export function pieceToUnicode(p: Piece): string {
  return PIECE_UNICODE[p.color + p.type] ?? '?';
}

const PIECE_VALUES: Record<PieceType, number> = {
  P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0,
};

export function pieceValue(p: Piece): number {
  return PIECE_VALUES[p.type];
}

/* ── Initial board ─────────────────────────────── */

export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const backRank: PieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let c = 0; c < 8; c++) {
    board[0][c] = { color: 'b', type: backRank[c] };
    board[1][c] = { color: 'b', type: 'P' };
    board[6][c] = { color: 'w', type: 'P' };
    board[7][c] = { color: 'w', type: backRank[c] };
  }
  return board;
}

export function createInitialState(): GameState {
  return {
    board: createInitialBoard(),
    turn: 'w',
    castling: {
      w: { K: true, Q: true },
      b: { K: true, Q: true },
    },
    enPassantTarget: null,
    moveHistory: [],
    halfMoveClock: 0,
    fullMoveNumber: 1,
    status: 'playing',
  };
}

/* ── Helpers ───────────────────────────────────── */

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((sq) => (sq ? { ...sq } : null)));
}

function findKing(board: Board, color: Color): { r: number; c: number } {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === 'K') return { r, c };
    }
  return { r: 0, c: 0 }; // Should never happen in valid game
}

/* ── Attack detection ──────────────────────────── */

function isSquareAttackedBy(board: Board, r: number, c: number, by: Color): boolean {
  // Pawn attacks
  const pawnDir = by === 'w' ? -1 : 1;
  const pawnR = r + pawnDir;
  for (const dc of [-1, 1]) {
    if (inBounds(pawnR, c + dc)) {
      const p = board[pawnR][c + dc];
      if (p && p.color === by && p.type === 'P') return true;
    }
  }

  // Knight attacks
  const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  for (const [dr, dc] of knightMoves) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.color === by && p.type === 'N') return true;
    }
  }

  // King attacks
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc)) {
        const p = board[nr][nc];
        if (p && p.color === by && p.type === 'K') return true;
      }
    }

  // Sliding pieces (Rook/Queen for straight, Bishop/Queen for diagonal)
  const straight = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const diagonal = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  for (const [dr, dc] of straight) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === by && (p.type === 'R' || p.type === 'Q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }

  for (const [dr, dc] of diagonal) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p) {
        if (p.color === by && (p.type === 'B' || p.type === 'Q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }

  return false;
}

export function isInCheck(board: Board, color: Color): boolean {
  const king = findKing(board, color);
  const enemy = color === 'w' ? 'b' : 'w';
  return isSquareAttackedBy(board, king.r, king.c, enemy);
}

/* ── Pseudo-legal move generation ──────────────── */

function pseudoLegalMoves(state: GameState, r: number, c: number): Move[] {
  const { board, castling, enPassantTarget } = state;
  const piece = board[r][c];
  if (!piece) return [];
  const color = piece.color;
  const moves: Move[] = [];

  const addMove = (toR: number, toC: number, extra?: Partial<Move>) => {
    const capture = board[toR][toC] ?? undefined;
    moves.push({ fromR: r, fromC: c, toR, toC, capture, ...extra });
  };

  const trySlide = (dr: number, dc: number) => {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const target = board[nr][nc];
      if (target) {
        if (target.color !== color) addMove(nr, nc);
        break;
      }
      addMove(nr, nc);
      nr += dr; nc += dc;
    }
  };

  switch (piece.type) {
    case 'P': {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const promoRow = color === 'w' ? 0 : 7;
      // Forward
      if (inBounds(r + dir, c) && !board[r + dir][c]) {
        if (r + dir === promoRow) {
          for (const pt of ['Q', 'R', 'B', 'N'] as PieceType[]) {
            addMove(r + dir, c, { promotion: pt });
          }
        } else {
          addMove(r + dir, c);
        }
        // Double push
        if (r === startRow && !board[r + 2 * dir][c]) {
          addMove(r + 2 * dir, c);
        }
      }
      // Captures
      for (const dc of [-1, 1]) {
        const nc = c + dc;
        if (inBounds(r + dir, nc)) {
          const target = board[r + dir][nc];
          if (target && target.color !== color) {
            if (r + dir === promoRow) {
              for (const pt of ['Q', 'R', 'B', 'N'] as PieceType[]) {
                addMove(r + dir, nc, { promotion: pt });
              }
            } else {
              addMove(r + dir, nc);
            }
          }
          // En passant
          if (enPassantTarget && enPassantTarget.r === r + dir && enPassantTarget.c === nc) {
            addMove(r + dir, nc, { enPassant: true, capture: { color: color === 'w' ? 'b' : 'w', type: 'P' } });
          }
        }
      }
      break;
    }
    case 'N': {
      const jumps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      for (const [dr, dc] of jumps) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc)) {
          const target = board[nr][nc];
          if (!target || target.color !== color) addMove(nr, nc);
        }
      }
      break;
    }
    case 'B':
      for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) trySlide(dr, dc);
      break;
    case 'R':
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) trySlide(dr, dc);
      break;
    case 'Q':
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) trySlide(dr, dc);
      break;
    case 'K': {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (inBounds(nr, nc)) {
            const target = board[nr][nc];
            if (!target || target.color !== color) addMove(nr, nc);
          }
        }
      // Castling
      const enemy = color === 'w' ? 'b' : 'w';
      const row = color === 'w' ? 7 : 0;
      if (r === row && c === 4 && !isSquareAttackedBy(board, r, c, enemy)) {
        // Kingside
        if (castling[color].K && !board[row][5] && !board[row][6] &&
          board[row][7]?.type === 'R' && board[row][7]?.color === color &&
          !isSquareAttackedBy(board, row, 5, enemy) &&
          !isSquareAttackedBy(board, row, 6, enemy)) {
          moves.push({ fromR: r, fromC: c, toR: row, toC: 6, castle: 'K' });
        }
        // Queenside
        if (castling[color].Q && !board[row][3] && !board[row][2] && !board[row][1] &&
          board[row][0]?.type === 'R' && board[row][0]?.color === color &&
          !isSquareAttackedBy(board, row, 3, enemy) &&
          !isSquareAttackedBy(board, row, 2, enemy)) {
          moves.push({ fromR: r, fromC: c, toR: row, toC: 2, castle: 'Q' });
        }
      }
      break;
    }
  }

  return moves;
}

/* ── Legal move generation ─────────────────────── */

function isLegalMove(state: GameState, move: Move): boolean {
  const newBoard = cloneBoard(state.board);
  const piece = newBoard[move.fromR][move.fromC]!;

  // Execute move on clone
  newBoard[move.toR][move.toC] = piece;
  newBoard[move.fromR][move.fromC] = null;

  // En passant capture
  if (move.enPassant) {
    const capturedRow = piece.color === 'w' ? move.toR + 1 : move.toR - 1;
    newBoard[capturedRow][move.toC] = null;
  }

  // Castling rook move
  if (move.castle) {
    const row = move.fromR;
    if (move.castle === 'K') {
      newBoard[row][5] = newBoard[row][7];
      newBoard[row][7] = null;
    } else {
      newBoard[row][3] = newBoard[row][0];
      newBoard[row][0] = null;
    }
  }

  // Promotion
  if (move.promotion) {
    newBoard[move.toR][move.toC] = { color: piece.color, type: move.promotion };
  }

  return !isInCheck(newBoard, piece.color);
}

export function getLegalMoves(state: GameState, r: number, c: number): Move[] {
  const piece = state.board[r][c];
  if (!piece || piece.color !== state.turn) return [];
  return pseudoLegalMoves(state, r, c).filter((m) => isLegalMove(state, m));
}

export function getAllLegalMoves(state: GameState): Move[] {
  const moves: Move[] = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (p && p.color === state.turn) {
        moves.push(...getLegalMoves(state, r, c));
      }
    }
  return moves;
}

/* ── Make move ─────────────────────────────────── */

export function makeMove(state: GameState, move: Move): GameState {
  const board = cloneBoard(state.board);
  const piece = board[move.fromR][move.fromC]!;
  const newCastling = {
    w: { ...state.castling.w },
    b: { ...state.castling.b },
  };

  // Move the piece
  board[move.toR][move.toC] = piece;
  board[move.fromR][move.fromC] = null;

  // En passant capture
  if (move.enPassant) {
    const capturedRow = piece.color === 'w' ? move.toR + 1 : move.toR - 1;
    board[capturedRow][move.toC] = null;
  }

  // Castling rook
  if (move.castle) {
    const row = move.fromR;
    if (move.castle === 'K') {
      board[row][5] = board[row][7];
      board[row][7] = null;
    } else {
      board[row][3] = board[row][0];
      board[row][0] = null;
    }
  }

  // Promotion
  if (move.promotion) {
    board[move.toR][move.toC] = { color: piece.color, type: move.promotion };
  }

  // Update castling rights
  if (piece.type === 'K') {
    newCastling[piece.color].K = false;
    newCastling[piece.color].Q = false;
  }
  if (piece.type === 'R') {
    if (move.fromC === 0) newCastling[piece.color].Q = false;
    if (move.fromC === 7) newCastling[piece.color].K = false;
  }
  // If rook captured
  if (move.capture?.type === 'R') {
    if (move.toR === 0 && move.toC === 0) newCastling.b.Q = false;
    if (move.toR === 0 && move.toC === 7) newCastling.b.K = false;
    if (move.toR === 7 && move.toC === 0) newCastling.w.Q = false;
    if (move.toR === 7 && move.toC === 7) newCastling.w.K = false;
  }

  // En passant target
  let enPassantTarget: GameState['enPassantTarget'] = null;
  if (piece.type === 'P' && Math.abs(move.toR - move.fromR) === 2) {
    enPassantTarget = { r: (move.fromR + move.toR) / 2, c: move.fromC };
  }

  const nextTurn: Color = state.turn === 'w' ? 'b' : 'w';

  const newState: GameState = {
    board,
    turn: nextTurn,
    castling: newCastling,
    enPassantTarget,
    moveHistory: [...state.moveHistory, move],
    halfMoveClock: piece.type === 'P' || move.capture ? 0 : state.halfMoveClock + 1,
    fullMoveNumber: state.turn === 'b' ? state.fullMoveNumber + 1 : state.fullMoveNumber,
    status: 'playing',
  };

  // Check for checkmate / stalemate
  const allMoves = getAllLegalMoves(newState);
  if (allMoves.length === 0) {
    if (isInCheck(board, nextTurn)) {
      newState.status = 'checkmate';
    } else {
      newState.status = 'stalemate';
    }
  } else if (newState.halfMoveClock >= 100) {
    newState.status = 'draw';
  }

  return newState;
}

/* ── Algebraic notation ────────────────────────── */

const FILES = 'abcdefgh';
const RANKS = '87654321';

export function moveToAlgebraic(state: GameState, move: Move): string {
  const piece = state.board[move.fromR][move.fromC]!;

  if (move.castle === 'K') return 'O-O';
  if (move.castle === 'Q') return 'O-O-O';

  let notation = '';

  if (piece.type !== 'P') {
    notation += piece.type;
  }

  // Disambiguation
  if (piece.type !== 'P') {
    const others = pseudoLegalMoves(state, move.fromR, move.fromC)
      .filter((m) => m.toR === move.toR && m.toC === move.toC);
    // Find other pieces of same type that can also move to same square
    let needFile = false, needRank = false;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        if (r === move.fromR && c === move.fromC) continue;
        const p = state.board[r][c];
        if (p && p.color === piece.color && p.type === piece.type) {
          const otherMoves = getLegalMoves(state, r, c);
          if (otherMoves.some((m) => m.toR === move.toR && m.toC === move.toC)) {
            if (c !== move.fromC) needFile = true;
            else if (r !== move.fromR) needRank = true;
            else { needFile = true; needRank = true; }
          }
        }
      }
    if (needFile || others.length > 1) notation += FILES[move.fromC];
    if (needRank) notation += RANKS[move.fromR];
  }

  if (move.capture || move.enPassant) {
    if (piece.type === 'P') notation += FILES[move.fromC];
    notation += 'x';
  }

  notation += FILES[move.toC] + RANKS[move.toR];

  if (move.promotion) notation += '=' + move.promotion;

  // Check / checkmate
  const after = makeMove(state, move);
  if (after.status === 'checkmate') notation += '#';
  else if (isInCheck(after.board, after.turn)) notation += '+';

  return notation;
}

/* ── AI – Piece-Square Tables ──────────────────── */

// Positive = good for the piece's owner; mirrored for black
const PST_PAWN = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const PST_KNIGHT = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const PST_BISHOP = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const PST_ROOK = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0],
];

const PST_QUEEN = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];

const PST_KING_MID = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20],
];

const PST: Record<PieceType, number[][]> = {
  P: PST_PAWN,
  N: PST_KNIGHT,
  B: PST_BISHOP,
  R: PST_ROOK,
  Q: PST_QUEEN,
  K: PST_KING_MID,
};

const MATERIAL: Record<PieceType, number> = {
  P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000,
};

function getPstValue(piece: Piece, r: number, c: number): number {
  const table = PST[piece.type];
  // For white pieces, read table as-is; for black, mirror vertically
  const row = piece.color === 'w' ? r : 7 - r;
  return table[row][c];
}

/* ── Static board evaluation ───────────────────── */

function evaluate(state: GameState): number {
  const { board } = state;
  let score = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const sign = piece.color === 'w' ? 1 : -1;
      score += sign * (MATERIAL[piece.type] + getPstValue(piece, r, c));
    }
  }

  // Mobility bonus (light)
  const savedTurn = state.turn;
  const wMobility = countMobility({ ...state, turn: 'w' });
  const bMobility = countMobility({ ...state, turn: 'b' });
  score += (wMobility - bMobility) * 5;
  // Restore conceptual turn (we didn't mutate, just used spread)
  void savedTurn;

  return score;
}

function countMobility(state: GameState): number {
  let count = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (p && p.color === state.turn) {
        count += getLegalMoves(state, r, c).length;
      }
    }
  return count;
}

/* ── Minimax with Alpha-Beta Pruning ───────────── */

const AI_DEPTH = 3;

function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
): number {
  if (depth === 0 || state.status !== 'playing') {
    if (state.status === 'checkmate') {
      return maximizing ? -99999 + (AI_DEPTH - depth) : 99999 - (AI_DEPTH - depth);
    }
    if (state.status === 'stalemate' || state.status === 'draw') return 0;
    return evaluate(state);
  }

  const moves = getAllLegalMoves(state);

  // Move ordering: captures first, then by estimated value
  moves.sort((a, b) => {
    const aScore = (a.capture ? MATERIAL[a.capture.type] : 0) + (a.promotion ? 800 : 0);
    const bScore = (b.capture ? MATERIAL[b.capture.type] : 0) + (b.promotion ? 800 : 0);
    return bScore - aScore;
  });

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const newState = makeMove(state, move);
      const val = minimax(newState, depth - 1, alpha, beta, false);
      maxEval = Math.max(maxEval, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const newState = makeMove(state, move);
      const val = minimax(newState, depth - 1, alpha, beta, true);
      minEval = Math.min(minEval, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

/* ── Public: get best move for current player ──── */

export function getBestMove(state: GameState): Move | null {
  const moves = getAllLegalMoves(state);
  if (moves.length === 0) return null;

  const maximizing = state.turn === 'w';
  let bestMove = moves[0];
  let bestVal = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const newState = makeMove(state, move);
    const val = minimax(newState, AI_DEPTH - 1, -Infinity, Infinity, !maximizing);

    if (maximizing ? val > bestVal : val < bestVal) {
      bestVal = val;
      bestMove = move;
    }
  }

  return bestMove;
}
