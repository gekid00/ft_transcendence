import { describe, it, expect } from "vitest";
import { getBestMove } from "../../src/game/ai.js";
import { createBoard, dropToken, Board } from "../../src/game/board.js";

describe("getBestMove — minimax depth 3", () => {
  it("joue le coup gagnant immédiat", () => {
    // L'IA (player 2) a 3 jetons alignés en bas — doit jouer la colonne 3 pour gagner
    let board = createBoard();
    board = dropToken(board, 0, 2)!;
    board = dropToken(board, 1, 2)!;
    board = dropToken(board, 2, 2)!;
    expect(getBestMove(board, 2)).toBe(3);
  });

  it("bloque la victoire de l'adversaire", () => {
    // Le joueur 1 a 3 jetons en bas — l'IA doit bloquer en colonne 3
    let board = createBoard();
    board = dropToken(board, 0, 1)!;
    board = dropToken(board, 1, 1)!;
    board = dropToken(board, 2, 1)!;
    expect(getBestMove(board, 2)).toBe(3);
  });

  it("retourne une colonne valide sur un plateau vide", () => {
    const board = createBoard();
    const move = getBestMove(board, 2);
    expect(move).toBeGreaterThanOrEqual(0);
    expect(move).toBeLessThanOrEqual(6);
  });

  it("ne joue pas dans une colonne pleine", () => {
    let board = createBoard();
    for (let i = 0; i < 6; i++) board = dropToken(board, 3, i % 2 === 0 ? 1 : 2)!;
    const move = getBestMove(board, 2);
    expect(move).not.toBe(3);
  });
});
