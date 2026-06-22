import { createBoard, dropToken, getValidMoves, getDropRow, ROWS, COLS, Board, Cell } from "../game/board.js";

// Verifie si 4 jeton sont aligne dans les 4 directions
export function checkWin(board: Board): Cell | null
{
  const rows = board.length;
  const cols = board[0].length;

  // Directions : [horizontal, vertical, diag↘, diag↙]
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let row = 0; row < rows; row++)
{
    for (let col = 0; col < cols; col++)
    {
        const cell = board[row][col];
        if (cell === 0)
            continue;
        for (const [dr, dc] of directions)
        {
            let count = 1;    
            for (let i = 1; i < 4; i++)
            {
              const r = row + dr * i;
              const c = col + dc * i; 
              if (r < 0 || r >= rows || c < 0 || c >= cols)
                break;
              if (board[r][c] !== cell)
                break;
              count++;
            } 
            if (count === 4)
                return cell;
        }
    }
  }

  return null;
}

/**
 * Same scan as checkWin, but returns the 4 winning cell coordinates so
 * the frontend can highlight them. Returns null if there's no win on
 * the board. When multiple lines win simultaneously (rare), returns the
 * first one found in scan order.
 */
export function findWinningLine(board: Board): Array<[number, number]> | null {
  const rows = board.length;
  const cols = board[0].length;
  const directions: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = board[row][col];
      if (cell === 0) continue;
      for (const [dr, dc] of directions) {
        const line: Array<[number, number]> = [[row, col]];
        for (let i = 1; i < 4; i++) {
          const r = row + dr * i;
          const c = col + dc * i;
          if (r < 0 || r >= rows || c < 0 || c >= cols) break;
          if (board[r][c] !== cell) break;
          line.push([r, c]);
        }
        if (line.length === 4) return line;
      }
    }
  }
  return null;
}

// Check si le board est complet pour finir la partie
export function isDraw(board: Board): boolean {
  return board[0].every((cell) => cell !== 0);
}