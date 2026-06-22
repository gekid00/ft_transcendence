// Signature et vérification des JWT (JSON Web Tokens).
// Le payload contient l'userId — on s'en sert pour identifier le user à chaque requête.

import jwt from "jsonwebtoken";

// Le secret est lu depuis l'env. Sans lui, impossible de signer ou vérifier.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in environment");
}

// 7 jours = même durée que le cookie HttpOnly côté navigateur.
const TOKEN_EXPIRATION = "7d";

export interface TokenPayload {
  userId: number;
}

// Signe un payload avec notre secret et renvoie le token.
export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRATION });
}

// Vérifie un token. Renvoie le payload si valide, throw si invalide ou expiré.
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}
