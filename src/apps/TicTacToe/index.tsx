import { useState, useCallback } from 'react';
import type { AppComponentProps } from '@/shared/types';
import './TicTacToe.css';

/* ── Game Logic ──────────────────────────────── */

type Cell = 'X' | 'O' | null;
type Board = Cell[];
type Difficulty = 'easy' | 'medium' | 'hard';

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diags
];

function checkWinner(board: Board): { winner: Cell; line: number[] | null } {
  for (const combo of WINNING_LINES) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: combo };
    }
  }
  return { winner: null, line: null };
}

function isDraw(board: Board): boolean {
  return board.every((c) => c !== null) && !checkWinner(board).winner;
}

/* ── AI (Minimax with alpha-beta pruning) ───── */

function minimax(board: Board, isMaximizing: boolean, alpha: number, beta: number, depth: number): number {
  const { winner } = checkWinner(board);
  if (winner === 'O') return 10 - depth;
  if (winner === 'X') return depth - 10;
  if (board.every((c) => c !== null)) return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = 'O';
      best = Math.max(best, minimax(board, false, alpha, beta, depth + 1));
      board[i] = null;
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = 'X';
      best = Math.min(best, minimax(board, true, alpha, beta, depth + 1));
      board[i] = null;
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getAIMove(board: Board, difficulty: Difficulty): number {
  const empty = board.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
  if (empty.length === 0) return -1;

  // Easy: random move
  if (difficulty === 'easy') {
    return empty[Math.floor(Math.random() * empty.length)];
  }

  // Medium: 50% chance of best move, otherwise random
  if (difficulty === 'medium' && Math.random() < 0.5) {
    return empty[Math.floor(Math.random() * empty.length)];
  }

  // Hard / medium-best: minimax
  let bestScore = -Infinity;
  let bestMove = empty[0];
  for (const i of empty) {
    board[i] = 'O';
    const score = minimax(board, false, -Infinity, Infinity, 0);
    board[i] = null;
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }
  return bestMove;
}

/* ── Scoreboard Persistence ──────────────────── */

const SCORE_KEY = 'junios-tictactoe-score';

interface Score { wins: number; losses: number; draws: number; }

function loadScore(): Score {
  try {
    const s = localStorage.getItem(SCORE_KEY);
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  return { wins: 0, losses: 0, draws: 0 };
}

function saveScore(score: Score): void {
  localStorage.setItem(SCORE_KEY, JSON.stringify(score));
}

/* ── Component ───────────────────────────────── */

export default function TicTacToeApp(_props: AppComponentProps) {
  const [board, setBoard] = useState<Board>(Array(9).fill(null));
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [status, setStatus] = useState('Your turn');
  const [difficulty, setDifficulty] = useState<Difficulty>('hard');
  const [score, setScore] = useState<Score>(loadScore);

  const resetGame = useCallback(() => {
    setBoard(Array(9).fill(null));
    setIsPlayerTurn(true);
    setWinLine(null);
    setGameOver(false);
    setStatus('Your turn');
  }, []);

  const resetScore = useCallback(() => {
    const fresh = { wins: 0, losses: 0, draws: 0 };
    setScore(fresh);
    saveScore(fresh);
  }, []);

  const handleCellClick = useCallback((index: number) => {
    if (!isPlayerTurn || board[index] || gameOver) return;

    const newBoard = [...board];
    newBoard[index] = 'X';

    const { winner, line } = checkWinner(newBoard);
    if (winner === 'X') {
      setBoard(newBoard);
      setWinLine(line);
      setGameOver(true);
      setStatus('You win! 🎉');
      const next = { ...score, wins: score.wins + 1 };
      setScore(next);
      saveScore(next);
      return;
    }

    if (isDraw(newBoard)) {
      setBoard(newBoard);
      setGameOver(true);
      setStatus("It's a draw");
      const next = { ...score, draws: score.draws + 1 };
      setScore(next);
      saveScore(next);
      return;
    }

    setBoard(newBoard);
    setIsPlayerTurn(false);
    setStatus('Computer thinking…');

    // AI move after a short delay
    setTimeout(() => {
      const aiMove = getAIMove([...newBoard], difficulty);
      if (aiMove < 0) return;
      newBoard[aiMove] = 'O';

      const aiResult = checkWinner(newBoard);
      if (aiResult.winner === 'O') {
        setBoard([...newBoard]);
        setWinLine(aiResult.line);
        setGameOver(true);
        setStatus('Computer wins');
        setScore((prev) => {
          const next = { ...prev, losses: prev.losses + 1 };
          saveScore(next);
          return next;
        });
      } else if (isDraw(newBoard)) {
        setBoard([...newBoard]);
        setGameOver(true);
        setStatus("It's a draw");
        setScore((prev) => {
          const next = { ...prev, draws: prev.draws + 1 };
          saveScore(next);
          return next;
        });
      } else {
        setBoard([...newBoard]);
        setIsPlayerTurn(true);
        setStatus('Your turn');
      }
    }, 350);
  }, [board, isPlayerTurn, gameOver, difficulty, score]);

  return (
    <div className="ttt-app">
      {/* Header */}
      <div className="ttt-app__header">
        <div className="ttt-app__title">❌⭕ Tic-Tac-Toe</div>
        <div className="ttt-app__difficulty">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
            <button
              key={d}
              className={`ttt-app__diff-btn ${difficulty === d ? 'ttt-app__diff-btn--active' : ''}`}
              onClick={() => { setDifficulty(d); resetGame(); }}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Scoreboard */}
      <div className="ttt-app__scoreboard">
        <div className="ttt-app__score-item ttt-app__score-item--win">
          <span className="ttt-app__score-label">Wins</span>
          <span className="ttt-app__score-value">{score.wins}</span>
        </div>
        <div className="ttt-app__score-item ttt-app__score-item--draw">
          <span className="ttt-app__score-label">Draws</span>
          <span className="ttt-app__score-value">{score.draws}</span>
        </div>
        <div className="ttt-app__score-item ttt-app__score-item--loss">
          <span className="ttt-app__score-label">Losses</span>
          <span className="ttt-app__score-value">{score.losses}</span>
        </div>
        <button className="ttt-app__reset-score" onClick={resetScore} title="Reset scores">↺</button>
      </div>

      {/* Status */}
      <div className={`ttt-app__status ${gameOver ? 'ttt-app__status--done' : ''}`}>
        {status}
      </div>

      {/* Board */}
      <div className="ttt-app__board">
        {board.map((cell, i) => (
          <button
            key={i}
            className={`ttt-app__cell ${cell ? 'ttt-app__cell--filled' : ''} ${winLine?.includes(i) ? 'ttt-app__cell--win' : ''} ${!cell && !gameOver ? 'ttt-app__cell--hoverable' : ''}`}
            onClick={() => handleCellClick(i)}
            disabled={!!cell || gameOver || !isPlayerTurn}
          >
            {cell && (
              <span className={`ttt-app__mark ttt-app__mark--${cell.toLowerCase()}`}>
                {cell}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Play Again */}
      <button
        className={`ttt-app__play-again ${gameOver ? 'ttt-app__play-again--visible' : ''}`}
        onClick={resetGame}
        tabIndex={gameOver ? 0 : -1}
      >
        Play Again
      </button>
    </div>
  );
}
