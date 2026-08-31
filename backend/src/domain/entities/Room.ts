import { Peer } from "./Peer";

export type ParticipantRole = "HOST" | "PARTICIPANT";
export type RoomStatus = "CREATED" | "LIVE" | "ENDED";

export interface RoomProps {
  id: string;
  hostId?: string | null;
  status?: RoomStatus;
  version?: number;
  createdAt?: number;
  updatedAt?: number;
}

export class Room {
  readonly id: string;
  readonly createdAt: number;
  private _hostId: string | null;
  private _status: RoomStatus;
  private _version: number;
  private _updatedAt: number;
  private _peers: Map<string, Peer>;
  private _metadata: Map<string, string>;

  constructor(props: RoomProps) {
    this.id = props.id;
    this._hostId = props.hostId ?? null;
    this._status = props.status ?? "CREATED";
    this._version = props.version ?? 0;
    this.createdAt = props.createdAt ?? Date.now();
    this._updatedAt = props.updatedAt ?? Date.now();
    this._peers = new Map();
    this._metadata = new Map();
  }

  get hostId(): string | null {
    return this._hostId;
  }

  get status(): RoomStatus {
    return this._status;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): number {
    return this._updatedAt;
  }

  get peers(): Map<string, Peer> {
    return this._peers;
  }

  get peerCount(): number {
    return this._peers.size;
  }

  get isEmpty(): boolean {
    return this._peers.size === 0;
  }

  get activePeers(): Peer[] {
    return Array.from(this._peers.values());
  }

  bumpVersion(): void {
    this._version += 1;
    this._updatedAt = Date.now();
  }

  setHost(hostId: string): void {
    this._hostId = hostId;
    this.bumpVersion();
  }

  start(): void {
    this._status = "LIVE";
    this.bumpVersion();
  }

  end(): void {
    this._status = "ENDED";
    this.bumpVersion();
  }

  setMetadata(key: string, value: string): void {
    this._metadata.set(key, value);
    this.bumpVersion();
  }

  getMetadata(key: string): string | undefined {
    return this._metadata.get(key);
  }

  addPeer(peer: Peer): void {
    this._peers.set(peer.id, peer);
    if (!this._hostId && peer.role === "HOST") {
      this._hostId = peer.userId;
    }
    this.bumpVersion();
  }

  removePeer(peerId: string): Peer | undefined {
    const removed = this._peers.get(peerId);
    if (removed) {
      this._peers.delete(peerId);
      removed.markLeft();
      this.bumpVersion();
    }
    return removed;
  }

  getPeer(peerId: string): Peer | undefined {
    return this._peers.get(peerId);
  }

  hasPeer(peerId: string): boolean {
    return this._peers.has(peerId);
  }

  findPeerByUserId(userId: string): Peer | undefined {
    for (const peer of this._peers.values()) {
      if (peer.userId === userId) return peer;
    }
    return undefined;
  }

  replacePeerSocket(peerId: string, socket: Peer["socket"]): Peer | undefined {
    const peer = this._peers.get(peerId);
    if (peer) peer.socket = socket;
    return peer;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      hostId: this._hostId,
      status: this._status,
      version: this._version,
      peerCount: this.peerCount,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
