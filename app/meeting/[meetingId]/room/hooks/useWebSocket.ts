/* eslint-disable react-hooks/immutability */
'use client'

import { useRef, useCallback } from "react"
import toast from "react-hot-toast"
import type { SignalingMessage, PeerJoinData } from "../types"

const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 10000

interface UseWebSocketConfig {
  meetingId: string
  localStreamReady: React.MutableRefObject<boolean>
  streamFailed: React.MutableRefObject<boolean>
  socketIdRef: React.MutableRefObject<string | null>
  wsRef: React.MutableRefObject<WebSocket | null>
  onJoined: (data: { peerId: string; hostId: string | null }) => void
  onExistingPeers: (peers: PeerJoinData[]) => void
  onPeerJoined: (peerId: string, name: string, userId: string) => void
  onPeerLeft: (peerId: string) => void
  onOffer: (data: { senderPeerId: string; sdp: RTCSessionDescriptionInit }) => void
  onAnswer: (data: { senderPeerId: string; sdp: RTCSessionDescriptionInit }) => void
  onIceCandidate: (data: { senderPeerId: string; candidate: RTCIceCandidateInit }) => void
  onStreamUnavailable: (senderPeerId: string) => void
  onChatMessage: (data: { message: string; name: string; userId: string; timestamp: string }) => void
  onMeetingEnded: () => void
  onLobbyUpdate: (participants: { id: string; name: string }[] | undefined) => void
  onConnectionStatusChange: (status: string) => void
  onParticipantCountChange: (count: number) => void
}

interface UseWebSocketReturn {
  connect: () => Promise<void>
  disconnect: () => void
  sendMessage: (type: string, payload?: Record<string, unknown>) => void
}

export function useWebSocket(config: UseWebSocketConfig): UseWebSocketReturn {
  const reconnectAttempts = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectingRef = useRef(false)
  const joinSentRef = useRef(false)
  const meetingEndedRef = useRef(false)

  const connect = useCallback(async () => {
    if (
      connectingRef.current ||
      config.wsRef.current?.readyState === WebSocket.OPEN ||
      config.wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return
    }
    connectingRef.current = true

    try {
      const res = await fetch("/api/ws-token")
      if (!res.ok) {
        connectingRef.current = false
        return
      }

      const json = (await res.json()) as { token?: string }
      if (!json.token) {
        connectingRef.current = false
        return
      }
      const token = json.token
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'
      const wsUrl = `${backendUrl.replace(/^https/, 'wss').replace(/^http/, 'ws')}?token=${token}`

      const ws = new WebSocket(wsUrl)
      config.wsRef.current = ws
      joinSentRef.current = false

      ws.onopen = () => {
        if (joinSentRef.current) return
        joinSentRef.current = true
        config.onConnectionStatusChange("Connected")
        reconnectAttempts.current = 0
        ws.send(JSON.stringify({ type: "join", roomId: config.meetingId }))
      }

      ws.onmessage = async (e) => {
        try {
          const data = JSON.parse(e.data) as SignalingMessage

          if (data.type === "lobbyUpdate") {
            config.onLobbyUpdate(data.participants)
            config.onParticipantCountChange(data.participants?.length ?? 0)
          }

          if (data.type === "chatMessage" && data.data) {
            config.onChatMessage(data.data)
          }

          if (data.type === "meetingEnded") {
            meetingEndedRef.current = true
            toast.error("Meeting ended by host")
            config.onMeetingEnded()
            return
          }

          if (data.type === "joined") {
            config.onJoined({ peerId: data.peerId ?? "", hostId: data.hostId ?? null })
          }

          if (data.type === "existingPeers") {
            config.onExistingPeers(data.peers ?? [])
          }

          if (data.type === "peerJoined") {
            config.onPeerJoined(data.senderPeerId ?? "", data.name ?? "", data.userId ?? "")
          }

          if (data.type === "peerLeft") {
            config.onPeerLeft(data.senderPeerId ?? "")
          }

          if (data.type === "offer" && data.sdp) {
            config.onOffer({ senderPeerId: data.senderPeerId, sdp: data.sdp })
          }

          if (data.type === "answer" && data.sdp) {
            config.onAnswer({ senderPeerId: data.senderPeerId, sdp: data.sdp })
          }

          if (data.type === "ice-candidate" && data.candidate) {
            config.onIceCandidate({ senderPeerId: data.senderPeerId, candidate: data.candidate })
          }

          if (data.type === "stream-unavailable") {
            config.onStreamUnavailable(data.senderPeerId)
          }
        } catch {
        }
      }

      ws.onclose = () => {
        config.wsRef.current = null
        connectingRef.current = false

        if (meetingEndedRef.current) return

        config.onConnectionStatusChange("Disconnected")

        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts.current), RECONNECT_MAX_DELAY)

          reconnectTimerRef.current = setTimeout(() => {
            reconnectAttempts.current++
            reconnectTimerRef.current = null
            connect()
          }, delay)
        } else {
          config.onConnectionStatusChange("Connection lost")
          toast.error("Lost connection to server")
        }
      }

      ws.onerror = () => {
        config.onConnectionStatusChange("Error")
      }
      } catch {
      connectingRef.current = false
    }
  }, [config.meetingId])

  const disconnect = useCallback(() => {
    meetingEndedRef.current = true
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    config.wsRef.current?.close()
    config.wsRef.current = null
  }, [])

  const sendMessage = useCallback((type: string, payload?: Record<string, unknown>) => {
    if (config.wsRef.current?.readyState !== WebSocket.OPEN) return
    config.wsRef.current.send(JSON.stringify({ type, ...payload }))
  }, [])

  return { connect, disconnect, sendMessage }
}
