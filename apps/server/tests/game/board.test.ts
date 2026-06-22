import { describe, it, expect } from "vitest";
import { createBoard, dropToken, getValidMoves, getDropRow, ROWS, COLS, Board } from "../../src/game/board.js";

describe("createBoard", () => {
  it("creates a 6x7 board filled with zeros", () => {
    const board = createBoard();
    expect(board.length).toBe(ROWS);
    expect(board[0].length).toBe(COLS);
    expect(board.every((row) => row.every((cell) => cell === 0))).toBe(true);
  });
});

describe("dropToken", () => {
  it("places token at the bottom of an empty column", () => {
    const board = createBoard();
    const next = dropToken(board, 3, 1);
    expect(next![ROWS - 1][3]).toBe(1);
  });

  it("stacks tokens correctly", () => {
    let board = createBoard();
    board = dropToken(board, 0, 1)!;
    board = dropToken(board, 0, 2)!;
    expect(board[ROWS - 1][0]).toBe(1);
    expect(board[ROWS - 2][0]).toBe(2);
  });

  it("returns null when column is full", () => {
    let board = createBoard();
    for (let i = 0; i < ROWS; i++) board = dropToken(board, 0, 1)!;
    expect(dropToken(board, 0, 2)).toBeNull();
  });

  it("does not mutate the original board", () => {
    const board = createBoard();
    dropToken(board, 0, 1);
    expect(board[ROWS - 1][0]).toBe(0);
  });
});

describe("getValidMoves", () => {
  it("returns all columns on empty board", () => {
    const board = createBoard();
    expect(getValidMoves(board)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("excludes full columns", () => {
    let board = createBoard();
    for (let i = 0; i < ROWS; i++) board = dropToken(board, 0, 1)!;
    expect(getValidMoves(board)).not.toContain(0);
  });
});

it("returns only non-full columns on partial board", () => {
  const board: Board = [
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0],
    [0, 0, 2, 0, 0, 0, 0],
    [0, 0, 2, 0, 0, 0, 0],
    [0, 0, 1, 2, 0, 0, 0],
    [1, 2, 1, 2, 1, 0, 0],
  ];
  expect(getValidMoves(board)).toEqual([0, 1, 2, 3, 4, 5, 6]);
});
