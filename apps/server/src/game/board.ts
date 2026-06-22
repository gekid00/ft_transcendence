export type Cell = 0 | 1 | 2; // 0 = empty, 1 = player1, 2 = player2
export type Board = Cell[][];

export const ROWS = 6;
export const COLS = 7;

export function createBoard(rows = ROWS, cols = COLS): Board
{
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

// Retourne la rangee la plus basse de la colonne ou -1 si la rangee est pleine
export function getDropRow(board: Board, col: number): number
{
  for (let row = board.length - 1; row >= 0; row--) {
    if (board[row][col] === 0) return row;
  }
  return -1;
}

// Retourne un nouveau tableau avec le nouveaux jeton ou null si la colonne est pleine
export function dropToken(board: Board, col: number, player: 1 | 2): Board | null
{
  const row = getDropRow(board, col);
  if (row === -1)
    return null;
  const newBoard = board.map((r) => [...r]) as Board;
  newBoard[row][col] = player;
  return newBoard;
}

// Retourne une liste avec l'index des collones ou le jetons peut etre place
export function getValidMoves(board: Board): number[]
{
  const colonnes = board[0].map((_, col) => col);
  //[0, 1, 2, 3, 4, 5, 6]

  const colonnesJouables = colonnes.filter(col => getDropRow(board, col) !== -1);
  //colonnes non pleines

  return colonnesJouables;
}


