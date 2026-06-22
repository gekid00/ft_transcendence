import { Board, createBoard, dropToken, getDropRow } from "./board.js";
import { checkWin, isDraw } from "./check_board.js";

type GameStatus = "in_progress" | "finished" | "abandoned";

interface Players
{
  1: number;             // userId du joueur 1
  2: number | null;      // userId du joueur 2 (null si IA)
}

export interface MoveResult
{
  ok: boolean;
  row?: number;          // rangee ou le jeton est tombe (pour la persistance)
  moveNumber?: number;
}

export interface StateSnapshot
{
  board: Board;
  currentPlayer: 1 | 2;
  players: Players;
  status: GameStatus;
  winner: 1 | 2 | null;
  timerP1: number;
  timerP2: number;
  moveNumber: number;
}

export class GameState
{
  board: Board;
  currentPlayer: 1 | 2;
  players: Players;
  status: GameStatus;
  winner: 1 | 2 | null;
  timerP1: number;
  timerP2: number;
  moveNumber: number;

  constructor(players: Players, timePerPlayer = 300)
  {
    this.board = createBoard();
    this.currentPlayer = 1;
    this.players = players;
    this.status = "in_progress";
    this.winner = null;
    this.timerP1 = timePerPlayer;
    this.timerP2 = timePerPlayer;
    this.moveNumber = 0;
  }

  // Joue un coup dans la colonne donnee. Retourne la rangee + le numero de coup si valide.
  makeMove(col: number): MoveResult
  {
    if (this.status !== "in_progress")
      return { ok: false };

    const row = getDropRow(this.board, col);
    const newBoard = dropToken(this.board, col, this.currentPlayer);
    if (newBoard === null)
      return { ok: false };

    this.board = newBoard;
    this.moveNumber++;

    const gagnant = checkWin(this.board);
    if (gagnant !== null) {
      this.winner = gagnant as 1 | 2;
      this.status = "finished";
    } else if (isDraw(this.board)) {
      this.status = "finished";
    } else {
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    }

    return { ok: true, row, moveNumber: this.moveNumber };
  }

  // Abandon manuel d'un joueur : l'adversaire gagne.
  surrender(playerSlot: 1 | 2): void
  {
    if (this.status !== "in_progress")
      return;
    this.status = "abandoned";
    this.winner = playerSlot === 1 ? 2 : 1;
  }

  // userId -> slot 1 ou 2 (ou null si pas dans la partie)
  slotForUser(userId: number): 1 | 2 | null
  {
    if (this.players[1] === userId) return 1;
    if (this.players[2] === userId) return 2;
    return null;
  }

  // Retourne l'etat complet a envoyer au front via Socket.io
  getState(): StateSnapshot
  {
    return {
      board: this.board,
      currentPlayer: this.currentPlayer,
      players: this.players,
      status: this.status,
      winner: this.winner,
      timerP1: this.timerP1,
      timerP2: this.timerP2,
      moveNumber: this.moveNumber,
    };
  }
}
