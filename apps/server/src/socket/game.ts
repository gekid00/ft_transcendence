// Events game :
//   C->S  game:join      { gameId }       -> rejoint la room game:<id>, recoit l'etat
//   C->S  game:move      { gameId, col }  -> joue un coup (valide par le serveur)
//   C->S  game:surrender { gameId }       -> abandon manuel
//   S->C  game:state     { gameId, state }
//   S->C  game:timer     { gameId, timerP1, timerP2 }
//   S->C  game:over      { gameId, winner, winnerUserId, status }

import type { Server, Socket } from "socket.io";
import { gameManager } from "../game/gameManager.js";

export function registerGameHandlers(socket: Socket, io: Server)
{
  const userId: number = socket.data.userId;

  socket.on("game:join", async (payload: { gameId: number }) => {
    const { gameId } = payload ?? ({} as any);
    console.log(`[Socket game:join] userId: ${userId} (type: ${typeof userId}), gameId: ${gameId} (type: ${typeof gameId})`);
    if (typeof gameId !== "number") {
      console.log(`[Socket game:join] gameId is not a number!`);
      return;
    }

    const g = await gameManager.getOrRestore(gameId);
    console.log(`[Socket game:join] Found active game g: ${g ? "yes" : "no"}`);
    if (!g) return;
    
    const slot = g.state.slotForUser(userId);
    console.log(`[Socket game:join] slot for user: ${slot}, players:`, g.state.players);
    if (slot === null) return;

    socket.join(`game:${gameId}`);
    await gameManager.syncUserStatus(userId);
    
    const responsePayload: any = { gameId, state: g.state.getState() };
    if (g.isAi && g.lastAiTelemetry && g.lastAiMove) {
      responsePayload.aiMove = {
        col: g.lastAiMove.col,
        row: g.lastAiMove.row,
        telemetry: g.lastAiTelemetry,
      };
    }
    socket.emit("game:state", responsePayload);
  });

  socket.on("game:move", async (payload: { gameId: number; col: number }) => {
    const { gameId, col } = payload ?? ({} as any);
    if (typeof gameId !== "number" || typeof col !== "number") return;
    const r = await gameManager.applyMove(gameId, userId, col);
    if (!r.ok) socket.emit("game:error", { gameId, error: r.error });
  });

  socket.on("game:surrender", async (payload: { gameId: number }) => {
    const { gameId } = payload ?? ({} as any);
    if (typeof gameId !== "number") return;
    await gameManager.surrender(gameId, userId);
  });
}
