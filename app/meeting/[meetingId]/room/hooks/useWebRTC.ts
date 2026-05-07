/* eslint-disable react-hooks/immutability, react-hooks/exhaustive-deps */
'use client'

import { useRef, useCallback } from "react"
import type { SignalingState, PendingOffer, PendingPeer } from "../types"

interface UseWebRTCConfig {
  localStreamRef: React.MutableRefObject<MediaStream | null>
  localStreamReady: React.MutableRefObject<boolean>
  streamFailed: React.MutableRefObject<boolean>
  isCleaningUp: React.MutableRefObject<boolean>
  wsRef: React.MutableRefObject<WebSocket | null>
  socketIdRef: React.MutableRefObject<string | null>
  onAppendRemoteStream: (peerId: string, stream: MediaStream) => void
  onClosePeerConnection: (peerId: string) => void
}

interface UseWebREReturn {
  peerConnectionsRef: React.MutableRefObject<Map<string, RTCPeerConnection>>
  signalingStateRef: React.MutableRefObject<Map<string, SignalingState>>
  pendingIceCandidatesRef: React.MutableRefObject<Map<string, RTCIceCandidateInit[]>>
  createPeerConnection: (peerId: string) => Promise<RTCPeerConnection | null>
  setupPeerConnection: (peerId: string) => Promise<void>
  handleOffer: (data: { senderPeerId: string; sdp: RTCSessionDescriptionInit }) => Promise<void>
  handleAnswer: (data: { senderPeerId: string; sdp: RTCSessionDescriptionInit }) => Promise<void>
  handleIceCandidate: (data: { senderPeerId: string; candidate: RTCIceCandidateInit }) => Promise<void>
  closePeerConnection: (peerId: string) => void
  processPendingOffers: () => Promise<void>
  rejectPendingOffers: (ws: WebSocket | null, socketId: string | null) => void
  enqueuePendingPeer: (peer: PendingPeer) => void
  resetAll: () => void
  cleanupAll: () => void
}

function getTurnServers() {
  return (process.env.NEXT_PUBLIC_TURN_SERVERS || '').split(',').filter(Boolean).map(url => {
    const [urls, username, credential] = url.split('|')
    return { urls, username, credential }
  })
}

export function useWebRTC(config: UseWebRTCConfig): UseWebREReturn {
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const signalingStateRef = useRef<Map<string, SignalingState>>(new Map())
  const reconnectingPcsRef = useRef<Set<string>>(new Set())
  const pendingPeersRef = useRef<PendingPeer[]>([])
  const pendingOffersRef = useRef<PendingOffer[]>([])
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())

  const getSignalingState = useCallback((peerId: string): SignalingState => {
    if (!signalingStateRef.current.has(peerId)) {
      signalingStateRef.current.set(peerId, { makingOffer: false, ignoreOffer: false })
    }
    return signalingStateRef.current.get(peerId)!
  }, [])

  const sendLocalDescription = useCallback(async (peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId)
    if (!pc || !pc.localDescription) return
    if (config.wsRef.current?.readyState !== WebSocket.OPEN) return

    const type = pc.localDescription.type
    config.wsRef.current.send(JSON.stringify({
      type: type === "offer" ? "offer" : "answer",
      sdp: pc.localDescription,
      targetPeerId: peerId,
    }))
  }, [])

  const appendRemoteStream = useCallback((peerId: string, stream: MediaStream) => {
    config.onAppendRemoteStream(peerId, stream)
  }, [])

  const closePeerConnection = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId)
    if (pc) {
      pc.ontrack = null
      pc.onicecandidate = null
      pc.onconnectionstatechange = null
      pc.oniceconnectionstatechange = null
      pc.onnegotiationneeded = null
      pc.close()
      peerConnectionsRef.current.delete(peerId)
    }
    signalingStateRef.current.delete(peerId)
    reconnectingPcsRef.current.delete(peerId)
    pendingIceCandidatesRef.current.delete(peerId)
    config.onClosePeerConnection(peerId)
  }, [])

  const createPeerConnection = useCallback(async (peerId: string): Promise<RTCPeerConnection | null> => {
    if (peerConnectionsRef.current.has(peerId)) {
      return peerConnectionsRef.current.get(peerId)!
    }

    if (config.isCleaningUp.current) {
      return null
    }

    console.log('[WebRTC] Creating peer connection for', peerId)

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        ...getTurnServers()
      ],
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all'
    })

    peerConnectionsRef.current.set(peerId, pc)
    signalingStateRef.current.set(peerId, { makingOffer: false, ignoreOffer: false })

    pc.ontrack = (event) => {
      console.log('[WebRTC] ontrack fired for peer', peerId, 'kind:', event.track.kind, 'stream count:', event.streams.length)
      if (event.streams && event.streams[0]) {
        console.log('[WebRTC] Appending remote stream for peer', peerId, 'stream id:', event.streams[0].id)
        appendRemoteStream(peerId, event.streams[0])
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && config.wsRef.current?.readyState === WebSocket.OPEN) {
        config.wsRef.current.send(JSON.stringify({
          type: "ice-candidate",
          candidate: event.candidate,
          targetPeerId: peerId,
        }))
      }
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      console.log('[WebRTC] Connection state change for', peerId, ':', state)

      if (state === 'disconnected' || state === 'failed') {
        if (reconnectingPcsRef.current.has(peerId)) return

        reconnectingPcsRef.current.add(peerId)
        config.onClosePeerConnection(peerId)

        if (config.localStreamRef.current && !config.isCleaningUp.current) {
          setTimeout(() => {
            reconnectingPcsRef.current.delete(peerId)
            const existing = peerConnectionsRef.current.get(peerId)
            if (existing && existing.connectionState !== 'connected') {
              existing.close()
              peerConnectionsRef.current.delete(peerId)
              signalingStateRef.current.delete(peerId)
              pendingIceCandidatesRef.current.delete(peerId)
              setupPeerConnection(peerId).catch(console.error)
            }
          }, 2000)
        }
      }

      if (state === 'connected') {
        reconnectingPcsRef.current.delete(peerId)
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce()
      }
    }

    pc.onnegotiationneeded = async () => {
      try {
        const sigState = getSignalingState(peerId)
        if (sigState.makingOffer) return

        sigState.makingOffer = true
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        sigState.makingOffer = false

        await sendLocalDescription(peerId)
      } catch {
        const sigState = getSignalingState(peerId)
        sigState.makingOffer = false
      }
    }

    if (config.localStreamRef.current) {
      config.localStreamRef.current.getTracks().forEach(track => {
        try {
          pc.addTrack(track, config.localStreamRef.current!)
        } catch {
        }
      })
    }

    const bufferedCandidates = pendingIceCandidatesRef.current.get(peerId)
    if (bufferedCandidates && bufferedCandidates.length > 0) {
      for (const candidate of bufferedCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch {
        }
      }
      pendingIceCandidatesRef.current.delete(peerId)
    }

    return pc
  }, [])

  const setupPeerConnection = useCallback(async (peerId: string) => {
    console.log('[WebRTC] setupPeerConnection for', peerId)
    const pc = await createPeerConnection(peerId)
    if (!pc) return

    const polite = (config.socketIdRef.current || "") < peerId
    console.log('[WebRTC] Polite?', polite, 'my socketId:', config.socketIdRef.current, 'peerId:', peerId)
    if (!polite) return

    try {
      const sigState = getSignalingState(peerId)
      sigState.makingOffer = true
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      sigState.makingOffer = false
      console.log('[WebRTC] Created offer for', peerId)
      await sendLocalDescription(peerId)
    } catch (err) {
      console.error('[WebRTC] Error creating offer for', peerId, err)
      const sigState = getSignalingState(peerId)
      sigState.makingOffer = false
    }
  }, [])

  const handleOffer = useCallback(async (data: { senderPeerId: string; sdp: RTCSessionDescriptionInit }) => {
    const peerId = data.senderPeerId
    console.log('[WebRTC] Received offer from', peerId)

    if (config.streamFailed.current) {
      if (config.wsRef.current?.readyState === WebSocket.OPEN) {
        config.wsRef.current.send(JSON.stringify({
          type: "stream-unavailable",
          senderPeerId: config.socketIdRef.current,
          targetPeerId: peerId,
        }))
      }
      return
    }

    if (!config.localStreamReady.current) {
      console.log('[WebRTC] Local stream not ready, queuing offer from', peerId)
      const existingOffer = pendingOffersRef.current.find(p => p.peerId === peerId)
      if (!existingOffer) {
        pendingOffersRef.current.push({ peerId, sdp: data.sdp })
      }
      return
    }

    if (config.isCleaningUp.current) return

    let pc: RTCPeerConnection | null = peerConnectionsRef.current.get(peerId) ?? null
    if (!pc) {
      console.log('[WebRTC] Creating PC for offer from', peerId)
      pc = await createPeerConnection(peerId)
      if (!pc) return
    }

    const sigState = getSignalingState(peerId)
    const polite = (config.socketIdRef.current || "") < peerId

    const readyForOffer = !sigState.makingOffer
    const offerCollision = readyForOffer === false

    sigState.ignoreOffer = !polite && offerCollision
    if (sigState.ignoreOffer) {
      console.log('[WebRTC] Ignoring offer from', peerId, '(collision, impolite)')
      return
    }

    try {
      if (offerCollision) {
        console.log('[WebRTC] Rollback for collision with', peerId)
        await pc.setLocalDescription({ type: "rollback" } as RTCSessionDescription)
      }

      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      console.log('[WebRTC] Created answer for', peerId)
      await sendLocalDescription(peerId)
    } catch (err) {
      console.error('[WebRTC] Error handling offer from', peerId, err)
    }
  }, [])

  const handleAnswer = useCallback(async (data: { senderPeerId: string; sdp: RTCSessionDescriptionInit }) => {
    const peerId = data.senderPeerId
    console.log('[WebRTC] Received answer from', peerId)
    const pc = peerConnectionsRef.current.get(peerId)
    if (!pc) {
      console.warn('[WebRTC] No PC found for answer from', peerId)
      return
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      console.log('[WebRTC] Set remote description for answer from', peerId)
    } catch (err) {
      console.error('[WebRTC] Error setting remote description for', peerId, err)
    }
  }, [])

  const handleIceCandidate = useCallback(async (data: { senderPeerId: string; candidate: RTCIceCandidateInit }) => {
    const peerId = data.senderPeerId
    const pc = peerConnectionsRef.current.get(peerId)

    if (pc && data.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
      } catch {
      }
    } else if (data.candidate) {
      if (!pendingIceCandidatesRef.current.has(peerId)) {
        pendingIceCandidatesRef.current.set(peerId, [])
      }
      pendingIceCandidatesRef.current.get(peerId)!.push(data.candidate)
    }
  }, [])

  const processPendingOffers = useCallback(async () => {
    console.log('[WebRTC] Processing pending offers:', pendingOffersRef.current.length, 'pending peers:', pendingPeersRef.current.length)
    const offers = [...pendingOffersRef.current]
    pendingOffersRef.current = []

    for (const pending of offers) {
      console.log('[WebRTC] Processing pending offer for', pending.peerId)
      await handleOffer({ senderPeerId: pending.peerId, sdp: pending.sdp })
    }

    const peers = [...pendingPeersRef.current]
    pendingPeersRef.current = []

    for (const peer of peers) {
      console.log('[WebRTC] Processing pending peer', peer.peerId)
      await setupPeerConnection(peer.peerId)
    }
  }, [])

  const rejectPendingOffers = useCallback((ws: WebSocket | null, socketId: string | null) => {
    for (const pending of pendingOffersRef.current) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "stream-unavailable",
          senderPeerId: socketId,
          targetPeerId: pending.peerId,
        }))
      }
    }
    pendingOffersRef.current = []
    pendingPeersRef.current = []
  }, [])

  const enqueuePendingPeer = useCallback((peer: PendingPeer) => {
    pendingPeersRef.current.push(peer)
  }, [])

  const resetAll = useCallback(() => {
    peerConnectionsRef.current.forEach(pc => {
      pc.ontrack = null
      pc.onicecandidate = null
      pc.onconnectionstatechange = null
      pc.oniceconnectionstatechange = null
      pc.onnegotiationneeded = null
      pc.close()
    })
    peerConnectionsRef.current.clear()
    signalingStateRef.current.clear()
    reconnectingPcsRef.current.clear()
    pendingPeersRef.current = []
    pendingOffersRef.current = []
    pendingIceCandidatesRef.current.clear()
  }, [])

  const cleanupAll = useCallback(() => {
    resetAll()
  }, [resetAll])

  return {
    peerConnectionsRef,
    signalingStateRef,
    pendingIceCandidatesRef,
    createPeerConnection,
    setupPeerConnection,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    closePeerConnection,
    processPendingOffers,
    rejectPendingOffers,
    enqueuePendingPeer,
    resetAll,
    cleanupAll
  }
}
