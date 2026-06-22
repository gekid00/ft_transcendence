export const ELO_K = 32;

export type AiDifficulty = "easy" | "medium" | "hard";
export type GameOutcome = 0 | 0.5 | 1;

export type Title =
  | "Beginner"
  | "Apprentice"
  | "Expert"
  | "Master"
  | "Grandmaster";

export function eloDelta(
  myRating: number,
  oppRating: number,
  score: GameOutcome,
  k: number = ELO_K,
): number {
  const expected = 1 / (1 + Math.pow(10, (oppRating - myRating) / 400));
  return Math.round(k * (score - expected));
}

export function phantomRatingForDifficulty(difficulty: AiDifficulty): number {
  switch (difficulty) {
    case "easy":
      return 800;
    case "medium":
      return 1200;
    case "hard":
      return 1800;
  }
}

export function titleForRating(rating: number): Title {
  if (rating >= 2200) return "Grandmaster";
  if (rating >= 1800) return "Master";
  if (rating >= 1400) return "Expert";
  if (rating >= 1000) return "Apprentice";
  return "Beginner";
}

export function getKFactor(rating: number, gamesPlayed: number): number {
  if (gamesPlayed < 20) return 40;
  if (rating >= 2400) return 10;
  return 20;
}
