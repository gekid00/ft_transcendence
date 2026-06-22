import { describe, it, expect } from "vitest";
import { checkWin, isDraw } from "../../src/game/check_board.js";
import { createBoard, dropToken, Board } from "../../src/game/board.js";

function fillCols(board: Board, player: 1 | 2, cols: number[]): Board {
  let b = board;
  for (const col of cols) b = dropToken(b, col, player)!;
  return b;
}

describe("checkWin — horizontal", () => {
  it("detects 4 in a row for player 1", () => {
    let board = createBoard();
    board = fillCols(board, 1, [0, 1, 2, 3]);
    expect(checkWin(board)).toBe(1);
  });

  it("detects 4 in a row for player 2", () => {
    let board = createBoard();
    board = fillCols(board, 2, [3, 4, 5, 6]);
    expect(checkWin(board)).toBe(2);
  });

  it("does not trigger on 3 in a row", () => {
    let board = createBoard();
    board = fillCols(board, 1, [0, 1, 2]);
    expect(checkWin(board)).toBeNull();
  });
});

describe("checkWin — vertical", () => {
  it("detects 4 stacked tokens for player 1", () => {
    let board = createBoard();
    board = fillCols(board, 1, [3, 3, 3, 3]);
    expect(checkWin(board)).toBe(1);
  });

  it("detects 4 stacked tokens for player 2", () => {
    let board = createBoard();
    board = fillCols(board, 2, [0, 0, 0, 0]);
    expect(checkWin(board)).toBe(2);
  });
});

describe("checkWin — diagonal ↘", () => {
  it("detects diagonal win for player 1", () => {
    // col0: 4 tokens tall, col1: 3, col2: 2, col3: 1 → player1 lands on diagonal
    let board = createBoard();
    board = fillCols(board, 2, [0, 0, 0]);
    board = fillCols(board, 2, [1, 1]);
    board = fillCols(board, 2, [2]);
    board = fillCols(board, 1, [0, 1, 2, 3]);
    expect(checkWin(board)).toBe(1);
  });
});

describe("checkWin — diagonal ↙", () => {
  it("detects anti-diagonal win for player 1", () => {
    // col6: 4 tokens tall, col5: 3, col4: 2, col3: 1
    let board = createBoard();
    board = fillCols(board, 2, [6, 6, 6]);
    board = fillCols(board, 2, [5, 5]);
    board = fillCols(board, 2, [4]);
    board = fillCols(board, 1, [6, 5, 4, 3]);
    expect(checkWin(board)).toBe(1);
  });
});

describe("checkWin — no winner", () => {
  it("returns null on an empty board", () => {
    expect(checkWin(createBoard())).toBeNull();
  });

  it("returns null when tokens alternate with no 4 in a row", () => {
    let board = createBoard();
    board = fillCols(board, 1, [0, 2, 4, 6]);
    board = fillCols(board, 2, [1, 3, 5]);
    expect(checkWin(board)).toBeNull();
  });
});

describe("isDraw", () => {
  it("returns false on an empty board", () => {
    expect(isDraw(createBoard())).toBe(false);
  });

  it("returns false on a partially filled board", () => {
    let board = createBoard();
    board = fillCols(board, 1, [0, 1, 2]);
    expect(isDraw(board)).toBe(false);
  });

  it("returns true when the top row is completely full", () => {
    const board: Board = [
      [1, 2, 1, 2, 1, 2, 1],
      [2, 1, 2, 1, 2, 1, 2],
      [1, 2, 1, 2, 1, 2, 1],
      [2, 1, 2, 1, 2, 1, 2],
      [1, 2, 1, 2, 1, 2, 1],
      [2, 1, 2, 1, 2, 1, 2],
    ];
    expect(isDraw(board)).toBe(true);
  });
});
