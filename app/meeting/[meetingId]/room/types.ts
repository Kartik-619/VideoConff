export interface PeerInfo {
  name: string
  userId: string
}

export interface PendingPeer {
  peerId: string
  name: string
  userId: string
}

export interface PendingOffer {
  peerId: string
  sdp: RTCSessionDescriptionInit
}

export interface SignalingState {
  makingOffer: boolean
  ignoreOffer: boolean
}

export interface ChatMessage {
  text: string
  name: string
  userId: string
  timestamp: string
}

export interface PeerJoinData {
  peerId: string
  name: string
  userId: string
}

export interface StreamInfo {
  id: string
  stream: MediaStream
  isLocal: boolean
  userName?: string
  userImage?: string
  isVideoOff?: boolean
}

export type SignalingMessage =
  | { type: 'lobbyUpdate'; participants?: { id: string; name: string }[] }
  | { type: 'joined'; peerId: string; hostId: string | null }
  | { type: 'existingPeers'; peers: PeerJoinData[] }
  | { type: 'peerJoined'; senderPeerId: string; name: string; userId: string }
  | { type: 'peerLeft'; senderPeerId: string }
  | { type: 'chatMessage'; data?: { message: string; name: string; userId: string; timestamp: string } }
  | { type: 'meetingEnded' }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit; senderPeerId: string; targetPeerId: string }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit; senderPeerId: string; targetPeerId: string }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit; senderPeerId: string; targetPeerId: string }
  | { type: 'request-offer'; targetPeerId: string; senderPeerId: string }
  | { type: 'join'; roomId: string; name: string; userId: string; senderPeerId: string }
  | { type: 'stream-unavailable'; senderPeerId: string; targetPeerId: string }
