import { Router } from "express";
import type { CommandBus } from "../../../application/commands/CommandBus";
import { CommandNames, EndMeetingCommand, StartMeetingCommand } from "../../../application/commands/commandDefinitions";
import type { AuthService } from "../../../application/services/AuthService";
import type { ConnectionRegistry } from "../../ws/ConnectionRegistry";
import type { RoomService } from "../../../application/services/RoomService";
import type { MeetingRepository } from "../../../application/ports/MeetingRepository";
import type { JwtService } from "../../../infrastructure/auth/JwtService";
import type { Logger } from "../../../application/ports/Logger";
import { AppError } from "../../../domain/errors/AppError";
import { getRequestContext } from "../middleware/RequestContext";
import { config } from "../../../config/config";

export interface MeetingRoutesDeps {
  commandBus: CommandBus;
  authService: AuthService;
  roomService: RoomService;
  registry: ConnectionRegistry;
  meetingRepository: MeetingRepository;
  jwtService: JwtService;
  logger: Logger;
}

function verifyOptionalToken(authService: AuthService, token?: unknown): Promise<{ id: string } | null> {
  if (!token || typeof token !== "string") return Promise.resolve(null);
  return authService.authenticateWsToken(token);
}

/**
 * Meeting lifecycle HTTP endpoints. Auth is enforced by the Next.js API
 * gateway; when a bearer token is supplied the server verifies it too.
 */
export function createMeetingRoutes(deps: MeetingRoutesDeps): Router {
  const router = Router();
  const ctx = () => getRequestContext();

  router.post("/leave", async (req, res, next) => {
    try {
      const { meetingId, userId, token } = req.body as {
        meetingId?: string;
        userId?: string;
        token?: string;
      };
      if (!meetingId || !userId) {
        throw AppError.validation("meetingId and userId required");
      }

      const authenticated = await verifyOptionalToken(deps.authService, token);
      if (token && !authenticated) {
        throw AppError.unauthorized("Invalid token");
      }
      if (authenticated && authenticated.id !== userId) {
        throw AppError.unauthorized("Token does not match userId");
      }

      const room = await deps.roomService.getRoom(meetingId);
      if (room) {
        const connections = deps.registry.getByRoom(meetingId);
        const matching = connections.filter((c) => c.userId === userId);
        for (const conn of matching) {
          conn.markReplaced();
          conn.close(1000, "left room");
        }
        await deps.meetingRepository.markParticipantLeft(meetingId, userId);
        deps.logger.info({ meetingId, userId }, "http.leave");
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/endMeeting", async (req, res, next) => {
    try {
      const { meetingId, token } = req.body as { meetingId?: string; token?: string };
      if (!meetingId) {
        throw AppError.validation("meetingId required");
      }
      const authenticated = await verifyOptionalToken(deps.authService, token);
      if (token && !authenticated) {
        throw AppError.unauthorized("Invalid token");
      }

      const command: EndMeetingCommand = {
        name: CommandNames.END_MEETING,
        payload: {
          userId: authenticated?.id ?? "system",
          socket: noopSocket,
          clientIp: ctx()?.clientIp,
          requestId: ctx()?.requestId,
          roomId: meetingId,
        },
      };
      await deps.commandBus.execute(command);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/startMeeting", async (req, res, next) => {
    try {
      const { meetingId } = req.body as { meetingId?: string };
      if (!meetingId) {
        throw AppError.validation("meetingId required");
      }

      const command: StartMeetingCommand = {
        name: CommandNames.START_MEETING,
        payload: {
          userId: "system",
          socket: noopSocket,
          clientIp: ctx()?.clientIp,
          requestId: ctx()?.requestId,
          roomId: meetingId,
        },
      };
      await deps.commandBus.execute(command);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/api/auth/refresh", async (req, res, next) => {
    try {
      const { userId } = req.body as { userId?: string };
      if (!userId) {
        throw AppError.validation("userId required");
      }
      const user = await deps.authService.authenticateWsToken(userId);
      void user;
      const { token } = deps.jwtService.signRefresh(
        userId,
        config.env.WS_TOKEN_TTL_SECONDS
      );
      res.json({ token, expiresInSeconds: config.env.WS_TOKEN_TTL_SECONDS });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

const noopSocket = {
  id: "http",
  send: () => false,
  close: () => undefined,
  readyState: "CLOSED" as const,
  markReplaced: () => undefined,
};
