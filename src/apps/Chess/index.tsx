import { useState, useCallback, useEffect } from 'react';
import type { AppComponentProps } from '@/shared/types';
import {
  createInitialState,
  getLegalMoves,
  makeMove,
  moveToAlgebraic,
  pieceToUnicode,
  pieceValue,
  isInCheck,
  getBestMove,
} from './chess-engine';
import type { GameState, Move, Piece } from './chess-engine';
import './Chess.css';

const FILES = 'abcdefgh';

export default function Chess(_props: AppComponentProps) {
  const [game, setGame] = useState<GameState>(createInitialState);
  const [selectedSquare, setSelectedSquare] = useState<{ r: number; c: number } | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [notations, setNotations] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  // AI plays black
  useEffect(() => {
    if (game.turn !== 'b' || game.status !== 'playing') return;
    setIsThinking(true);
    // Use setTimeout to avoid blocking the UI while computing
    const timer = setTimeout(() => {
      const best = getBestMove(game);
      if (best) {
        const notation = moveToAlgebraic(game, best);
        const newState = makeMove(game, best);
        setGame(newState);
        setNotations((prev) => [...prev, notation]);
      }
      setIsThinking(false);
    }, 50);
    return () => clearTimeout(timer);
  }, [game]);

  const handleSquareClick = useCallback((r: number, c: number) => {
    if (game.status !== 'playing' || game.turn !== 'w' || isThinking) return;

    // If clicking a valid move target, make the move
    const targetMove = validMoves.find((m) => m.toR === r && m.toC === c);
    if (targetMove) {
      // Auto-promote to queen (could add UI later)
      const move = targetMove.promotion
        ? validMoves.find((m) => m.toR === r && m.toC === c && m.promotion === 'Q') ?? targetMove
        : targetMove;
      const notation = moveToAlgebraic(game, move);
      const newState = makeMove(game, move);
      setGame(newState);
      setNotations((prev) => [...prev, notation]);
      setSelectedSquare(null);
      setValidMoves([]);
      return;
    }

    // Select a piece
    const piece = game.board[r][c];
    if (piece && piece.color === 'w') {
      setSelectedSquare({ r, c });
      setValidMoves(getLegalMoves(game, r, c));
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  }, [game, validMoves, isThinking]);

  const handleNewGame = useCallback(() => {
    setGame(createInitialState());
    setSelectedSquare(null);
    setValidMoves([]);
    setNotations([]);
    setIsThinking(false);
  }, []);

  // Gather captured pieces
  const captured: { w: Piece[]; b: Piece[] } = { w: [], b: [] };
  for (const move of game.moveHistory) {
    if (move.capture) {
      captured[move.capture.color].push(move.capture);
    }
  }
  // Sort captures by value (high first)
  captured.w.sort((a, b) => pieceValue(b) - pieceValue(a));
  captured.b.sort((a, b) => pieceValue(b) - pieceValue(a));

  // Build notation pairs (1. e4 e5  2. Nf3 Nc6  etc.)
  const movePairs: { num: number; white: string; black?: string }[] = [];
  for (let i = 0; i < notations.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: notations[i],
      black: notations[i + 1],
    });
  }

  // Last move highlight
  const lastMove = game.moveHistory.length > 0 ? game.moveHistory[game.moveHistory.length - 1] : null;

  // Check detection
  const inCheck = game.status === 'playing' && isInCheck(game.board, game.turn);

  return (
    <div className="chess-app">
      {/* Board area */}
      <div className="chess-app__board-area">
        <div className={`chess-app__turn-indicator ${inCheck ? 'chess-app__turn-indicator--check' : ''}`}>
          {game.status === 'checkmate'
            ? `Checkmate — ${game.turn === 'w' ? 'Black' : 'White'} wins!`
            : game.status === 'stalemate'
              ? 'Stalemate — Draw!'
              : game.status === 'draw'
                ? 'Draw by 50-move rule'
                : isThinking
                  ? 'Black is thinking…'
                  : `${game.turn === 'w' ? 'White' : 'Black'} to move${inCheck ? ' — Check!' : ''}`}
        </div>

        <div className="chess-app__board-wrapper">
          <div className="chess-app__board">
            {Array.from({ length: 8 }, (_, r) =>
              Array.from({ length: 8 }, (_, c) => {
                const piece = game.board[r][c];
                const isLight = (r + c) % 2 === 0;
                const isSelected = selectedSquare?.r === r && selectedSquare?.c === c;
                const validMove = validMoves.find((m) => m.toR === r && m.toC === c);
                const isValidMove = !!validMove && !validMove.capture && !validMove.enPassant;
                const isValidCapture = !!validMove && (!!validMove.capture || !!validMove.enPassant);
                const isLastMove = lastMove && (
                  (lastMove.fromR === r && lastMove.fromC === c) ||
                  (lastMove.toR === r && lastMove.toC === c)
                );
                const isCheckSquare = inCheck && piece?.type === 'K' && piece.color === game.turn;

                return (
                  <div
                    key={`${r}-${c}`}
                    className={[
                      'chess-app__square',
                      isLight ? 'chess-app__square--light' : 'chess-app__square--dark',
                      isSelected && 'chess-app__square--selected',
                      isValidMove && 'chess-app__square--valid-move',
                      isValidCapture && 'chess-app__square--valid-capture',
                      isLastMove && 'chess-app__square--last-move',
                      isCheckSquare && 'chess-app__square--check',
                    ].filter(Boolean).join(' ')}
                    onClick={() => handleSquareClick(r, c)}
                  >
                    {/* Coordinate labels */}
                    {c === 0 && <span className="chess-app__rank-label">{8 - r}</span>}
                    {r === 7 && <span className="chess-app__file-label">{FILES[c]}</span>}

                    {piece && (
                      <span className="chess-app__piece">
                        {pieceToUnicode(piece)}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Game over overlay */}
          {game.status !== 'playing' && (
            <div className="chess-app__game-over">
              <div className="chess-app__game-over-text">
                {game.status === 'checkmate' ? '♔ Checkmate' : game.status === 'stalemate' ? '½ Stalemate' : '½ Draw'}
              </div>
              <div className="chess-app__game-over-sub">
                {game.status === 'checkmate'
                  ? `${game.turn === 'w' ? 'Black' : 'White'} wins`
                  : 'Game drawn'}
              </div>
              <button className="chess-app__game-over-btn" onClick={handleNewGame}>
                New Game
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div className="chess-app__sidebar">
        <div className="chess-app__sidebar-title">Captured</div>
        <div className="chess-app__captured">
          <div className="chess-app__captured-label">White captured:</div>
          <div className="chess-app__captured-pieces">
            {captured.b.map((p, i) => <span key={i}>{pieceToUnicode(p)}</span>)}
          </div>
        </div>
        <div className="chess-app__captured">
          <div className="chess-app__captured-label">Black captured:</div>
          <div className="chess-app__captured-pieces">
            {captured.w.map((p, i) => <span key={i}>{pieceToUnicode(p)}</span>)}
          </div>
        </div>

        <div className="chess-app__sidebar-title">Moves</div>
        <div className="chess-app__moves">
          {movePairs.map((pair) => (
            <div key={pair.num} className="chess-app__move-row">
              <span className="chess-app__move-num">{pair.num}.</span>
              <span className="chess-app__move-white">{pair.white}</span>
              <span className="chess-app__move-black">{pair.black ?? ''}</span>
            </div>
          ))}
        </div>

        <div className="chess-app__actions">
          <button className="chess-app__action-btn" onClick={handleNewGame}>
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}
