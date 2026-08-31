import { Room } from "../entities/Room";

export interface RoomFactoryDeps {
  now?: () => number;
}

export class RoomFactory {
  private readonly now: () => number;

  constructor(deps: RoomFactoryDeps = {}) {
    this.now = deps.now ?? Date.now;
  }

  create(roomId: string, hostId?: string | null): Room {
    return new Room({
      id: roomId,
      hostId: hostId ?? null,
      status: "CREATED",
      version: 0,
      createdAt: this.now(),
      updatedAt: this.now(),
    });
  }

  hydrate(data: {
    id: string;
    hostId?: string | null;
    status?: "CREATED" | "LIVE" | "ENDED";
    version?: number;
    createdAt?: number;
    updatedAt?: number;
  }): Room {
    return new Room({
      id: data.id,
      hostId: data.hostId,
      status: data.status,
      version: data.version,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }
}
