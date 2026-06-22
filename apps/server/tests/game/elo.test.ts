import { describe, it, expect } from "vitest";
import {
  ELO_K,
  eloDelta,
  phantomRatingForDifficulty,
  titleForRating,
} from "../../src/game/elo.js";

describe("eloDelta", () => {
  it("returns 0 for a draw between equal ratings", () => {
    expect(eloDelta(1500, 1500, 0.5)).toBe(0);
  });

  it("returns a positive delta for a win against a higher-rated opponent", () => {
    const delta = eloDelta(1500, 1700, 1);
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(ELO_K);
  });

  it("returns a negative delta for a loss against a lower-rated opponent", () => {
    const delta = eloDelta(1500, 1300, 0);
    expect(delta).toBeLessThan(0);
    expect(delta).toBeGreaterThanOrEqual(-ELO_K);
  });

  it("clamps the magnitude to K (max gain or loss per game)", () => {
    expect(Math.abs(eloDelta(1000, 2000, 1))).toBeLessThanOrEqual(ELO_K);
    expect(Math.abs(eloDelta(2200, 1000, 0))).toBeLessThanOrEqual(ELO_K);
  });

  it("zero-sum: winner gain ≈ loser loss", () => {
    const myDelta = eloDelta(1500, 1500, 1);
    const oppDelta = eloDelta(1500, 1500, 0);
    expect(myDelta).toBe(16); // K * (1 - 0.5) = 16
    expect(oppDelta).toBe(-16); // K * (0 - 0.5) = -16
    expect(myDelta).toBe(-oppDelta);
  });

  it("draw between unequal ratings: lower-rated gains, higher-rated loses", () => {
    const lower = eloDelta(1200, 1500, 0.5);
    const higher = eloDelta(1500, 1200, 0.5);
    expect(lower).toBeGreaterThan(0);
    expect(higher).toBeLessThan(0);
    expect(lower).toBe(-higher);
  });
});

describe("phantomRatingForDifficulty", () => {
  it("maps easy/medium/hard to 800/1200/1800", () => {
    expect(phantomRatingForDifficulty("easy")).toBe(800);
    expect(phantomRatingForDifficulty("medium")).toBe(1200);
    expect(phantomRatingForDifficulty("hard")).toBe(1800);
  });

  it("strictly increases with difficulty", () => {
    const easy = phantomRatingForDifficulty("easy");
    const medium = phantomRatingForDifficulty("medium");
    const hard = phantomRatingForDifficulty("hard");
    expect(easy).toBeLessThan(medium);
    expect(medium).toBeLessThan(hard);
  });
});

describe("titleForRating", () => {
  it("returns Beginner below 1000", () => {
    expect(titleForRating(0)).toBe("Beginner");
    expect(titleForRating(999)).toBe("Beginner");
  });

  it("returns Apprentice at 1000-1399", () => {
    expect(titleForRating(1000)).toBe("Apprentice");
    expect(titleForRating(1399)).toBe("Apprentice");
  });

  it("returns Expert at 1400-1799", () => {
    expect(titleForRating(1400)).toBe("Expert");
    expect(titleForRating(1799)).toBe("Expert");
  });

  it("returns Master at 1800-2199", () => {
    expect(titleForRating(1800)).toBe("Master");
    expect(titleForRating(2199)).toBe("Master");
  });

  it("returns Grandmaster at 2200+", () => {
    expect(titleForRating(2200)).toBe("Grandmaster");
    expect(titleForRating(2854)).toBe("Grandmaster");
    expect(titleForRating(5000)).toBe("Grandmaster");
  });
});
