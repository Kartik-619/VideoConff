import { randomUUID } from "crypto";

export interface ChatMessageProps {
  id?: string;
  roomId: string;
  userId: string;
  name: string;
  message: string;
  timestamp?: number;
  fileMetadata?: {
    filename?: string;
    sizeBytes?: number;
    mimeType?: string;
    url?: string;
  } | null;
}

export class ChatMessage {
  readonly id: string;
  readonly roomId: string;
  readonly userId: string;
  readonly name: string;
  readonly message: string;
  readonly timestamp: number;
  readonly fileMetadata: ChatMessageProps["fileMetadata"];

  constructor(props: ChatMessageProps) {
    this.id = props.id ?? randomUUID();
    this.roomId = props.roomId;
    this.userId = props.userId;
    this.name = props.name;
    this.message = props.message.trim();
    this.timestamp = props.timestamp ?? Date.now();
    this.fileMetadata = props.fileMetadata ?? null;
  }

  toWireFormat() {
    return {
      message: this.message,
      userId: this.userId,
      name: this.name,
      timestamp: new Date(this.timestamp).toISOString(),
      file: this.fileMetadata,
    };
  }
}
