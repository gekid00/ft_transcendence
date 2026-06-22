// Hashing et vérification des mots de passe utilisateur.
// On centralise ici pour pouvoir changer l'algo ou les rounds en un seul endroit.

import bcrypt from "bcrypt";

// 12 rounds = ~150ms par hash. Plus = plus sûr mais plus lent.
const SALT_ROUNDS = 12;

// Hash un mot de passe en clair pour le stocker en base.
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

// Vérifie qu'un mot de passe en clair correspond à un hash stocké.
export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
