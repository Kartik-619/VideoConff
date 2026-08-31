import { z } from "zod";

const roomIdSchema = z
  .string()
  .trim()
  .min(1, "roomId is required")
  .max(128, "roomId too long")
  .regex(/^[\w\-:]{1,128}$/, "roomId contains invalid characters");

const sdpSchema = z.object({
  type: z.enum(["offer", "answer", "pranswer", "rollback"]),
  sdp: z.string().min(1).max(64 * 1024).refine((sdp) => sdp.startsWith("v=0"), {
    message: "Invalid SDP: missing v=0 header",
  }),
});

const candidateSchema = z.object({
  candidate: z.string().max(4096).refine((c) => c === "" || c.startsWith("candidate:"), {
    message: "Invalid ICE candidate",
  }),
  sdpMid: z.string().optional(),
  sdpMLineIndex: z.number().int().min(0).optional(),
});

const fileSchema = z
  .object({
    filename: z.string().max(255).optional(),
    sizeBytes: z.number().int().nonnegative().max(10 * 1024 * 1024 * 1024).optional(),
    mimeType: z.string().max(128).optional(),
    url: z.string().max(2048).optional(),
  })
  .strict()
  .optional();

export const joinSchema = z.object({
  type: z.literal("join"),
  roomId: roomIdSchema,
});

export const getParticipantsSchema = z.object({
  type: z.literal("getParticipants"),
});

export const chatMessageSchema = z.object({
  type: z.literal("chatMessage"),
  message: z
    .string()
    .trim()
    .min(1, "message is required")
    .max(4000, "message too long"),
  file: fileSchema,
});

export const offerSchema = z.object({
  type: z.literal("offer"),
  targetPeerId: z.string().min(1).max(64),
  sdp: sdpSchema,
});

export const answerSchema = z.object({
  type: z.literal("answer"),
  targetPeerId: z.string().min(1).max(64),
  sdp: sdpSchema,
});

export const iceCandidateSchema = z.object({
  type: z.literal("ice-candidate"),
  targetPeerId: z.string().min(1).max(64),
  candidate: candidateSchema,
});

export const streamUnavailableSchema = z.object({
  type: z.literal("stream-unavailable"),
  targetPeerId: z.string().min(1).max(64),
});

export const pingSchema = z.object({
  type: z.literal("ping"),
});

export const leaveSchema = z.object({
  type: z.literal("leave"),
});

export const inboundSchema = z.discriminatedUnion("type", [
  joinSchema,
  getParticipantsSchema,
  chatMessageSchema,
  offerSchema,
  answerSchema,
  iceCandidateSchema,
  streamUnavailableSchema,
  pingSchema,
  leaveSchema,
]);

export type ValidatedInbound = z.infer<typeof inboundSchema>;
