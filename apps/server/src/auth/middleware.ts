// Middleware d'authentification : vérifie que le user est connecté avant de laisser
// passer la requête. C'est le garde du corps de toutes nos routes privées.
//
// Flow sur une route protégée (ex: GET /api/profile) :
//   1. Y'a un cookie auth_token ? Non → 401, fin.
//   2. Le JWT est valide ? Non → 401, fin.
//   3. Le JWT n'a pas expiré ? Non → 401, fin.
//   4. Tout OK → on attache userId au request, la route s'exécute.
//
// Sans ce middleware, n'importe qui pourrait taper /api/profile et voir n'importe quel profil.

import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "./jwt.js";

// Ajoute le champ userId au type FastifyRequest (pour avoir l'autocomplétion + types).
declare module "fastify" {
  interface FastifyRequest {
    userId?: number;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Lit le cookie posé par /login ou /signup.
  const token = request.cookies?.auth_token;
  if (!token) {
    return reply.code(401).send({ error: "Not authenticated" });
  }

  // Vérifie la signature et l'expiration. Si le token est valide, on attache userId.
  try {
    const payload = verifyToken(token);
    request.userId = payload.userId;
  } catch {
    return reply.code(401).send({ error: "Invalid or expired token" });
  }
}
