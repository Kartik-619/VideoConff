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
  const peerTimeoutsRef = useRef<Map<string, { checking?: NodeJS.Timeout, connecting?: NodeJS.Timeout }>>(new Map())

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

  const closePeerConnection = useCallback((peerId: string) => {
    const timeouts = peerTimeoutsRef.current.get(peerId)
    if (timeouts) {
      if (timeouts.connecting) clearTimeout(timeouts.connecting)
      if (timeouts.checking) clearTimeout(timeouts.checking)
      peerTimeoutsRef.current.delete(peerId)
    }

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
      console.log(`Peer ${peerId} received remote track:`, event.track, event.streams)
      if (event.streams && event.streams[0]) {
        config.onAppendRemoteStream(peerId, event.streams[0])
      } else if (event.track) {
        const remoteStream = new MediaStream()
        remoteStream.addTrack(event.track)
        config.onAppendRemoteStream(peerId, remoteStream)
      }
    }

    pc.onicecandidate = (event) => {
      console.log(`Peer ${peerId} ICE candidate:`, event.candidate ? 'generated' : 'end of candidates')
      if (event.candidate && config.wsRef.current?.readyState === WebSocket.OPEN) {
        console.log(`Peer ${peerId} sending ICE candidate:`, event.candidate)
        config.wsRef.current.send(JSON.stringify({
          type: "ice-candidate",
          candidate: event.candidate,
          targetPeerId: peerId,
        }))
      }
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      const timeouts = peerTimeoutsRef.current.get(peerId) || {}

      if (state === 'connecting') {
        if (timeouts.connecting) clearTimeout(timeouts.connecting)
        timeouts.connecting = setTimeout(() => {
          if (pc.connectionState === 'connecting') {
            const sigState = getSignalingState(peerId)
            if (!sigState.makingOffer) {
              ;(async () => {
                try {
                  sigState.makingOffer = true
                  const offer = await pc.createOffer()
                  await pc.setLocalDescription(offer)
                  await sendLocalDescription(peerId)
                } catch {
                  sigState.makingOffer = false
                }
              })()
            }
          }
        }, 15000)
        peerTimeoutsRef.current.set(peerId, timeouts)
      } else {
        if (timeouts.connecting) {
          clearTimeout(timeouts.connecting)
          timeouts.connecting = undefined
          peerTimeoutsRef.current.set(peerId, timeouts)
        }
      }

      if (state === 'disconnected' || state === 'failed') {
        if (timeouts.connecting) {
          clearTimeout(timeouts.connecting)
          timeouts.connecting = undefined
        }
        if (timeouts.checking) {
          clearTimeout(timeouts.checking)
          timeouts.checking = undefined
        }
        peerTimeoutsRef.current.set(peerId, timeouts)
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
        if (timeouts.connecting) {
          clearTimeout(timeouts.connecting)
          timeouts.connecting = undefined
        }
        if (timeouts.checking) {
          clearTimeout(timeouts.checking)
          timeouts.checking = undefined
        }
        peerTimeoutsRef.current.set(peerId, timeouts)
      }
    }

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState
      const timeouts = peerTimeoutsRef.current.get(peerId) || {}

      if (state === 'failed') {
        pc.restartIce()
        const sigState = getSignalingState(peerId)
        if (!sigState.makingOffer) {
          ;(async () => {
            try {
              sigState.makingOffer = true
              const offer = await pc.createOffer()
              await pc.setLocalDescription(offer)
              await sendLocalDescription(peerId)
            } catch {
              sigState.makingOffer = false
            }
          })()
        }
      }

      if (state === 'checking') {
        if (timeouts.checking) clearTimeout(timeouts.checking)
        timeouts.checking = setTimeout(() => {
          if (pc.iceConnectionState === 'checking') {
            pc.restartIce()
          }
        }, 15000)
        peerTimeoutsRef.current.set(peerId, timeouts)
      } else {
        if (timeouts.checking) {
          clearTimeout(timeouts.checking)
          timeouts.checking = undefined
          peerTimeoutsRef.current.set(peerId, timeouts)
        }
      }
    }

    pc.onsignalingstatechange = () => {
      console.log(`Peer ${peerId} signaling state: ${pc.signalingState}`)
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
      } catch (err) {
        console.error(`Peer ${peerId} negotiation error:`, err)
        const sigState = getSignalingState(peerId)
        sigState.makingOffer = false
      }
    }

    if (config.localStreamRef.current) {
      const stream = config.localStreamRef.current
      console.log(`Peer ${peerId} adding ${stream.getTracks().length} local tracks`)
      stream.getTracks().forEach(track => {
        try {
          pc.addTrack(track, stream)
          console.log(`Peer ${peerId} added track:`, track.kind, track.id)
        } catch (err) {
          console.error(`Peer ${peerId} failed to add track:`, err)
        }
      })
    } else {
      console.warn(`Peer ${peerId} no local stream available when creating peer connection`)
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
    if (!config.localStreamReady.current) {
      enqueuePendingPeer({ peerId, name: '', userId: '' })
      return
    }

    const pc = await createPeerConnection(peerId)
    if (!pc) return

    const myId = config.socketIdRef.current || ""
    if (!myId) {
      enqueuePendingPeer({ peerId, name: '', userId: '' })
      return
    }

    const polite = myId < peerId
    console.log(`Peer ${peerId} setup - myId: ${myId}, polite: ${polite}, pc state: ${pc.signalingState}`)

    if (!polite) {
      console.log(`Peer ${peerId} is impolite (${myId} >= ${peerId}), waiting for offer from peer`)
      return
    }

    try {
      const sigState = getSignalingState(peerId)
      if (sigState.makingOffer) {
        console.log(`Peer ${peerId} already making offer, skipping`)
        return
      }

      sigState.makingOffer = true
      console.log(`Peer ${peerId} (polite) creating offer...`)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      console.log(`Peer ${peerId} set local description (offer), state: ${pc.signalingState}`)
      sigState.makingOffer = false

      await sendLocalDescription(peerId)
      console.log(`Peer ${peerId} offer sent`)
    } catch (err) {
      console.error(`Peer ${peerId} setup error:`, err)
      const sigState = getSignalingState(peerId)
      sigState.makingOffer = false
    }
  }, [])

  const handleOffer = useCallback(async (data: { senderPeerId: string; sdp: RTCSessionDescriptionInit }) => {
    const peerId = data.senderPeerId
    console.log(`Peer ${peerId} received offer:`, data.sdp.type)

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
      const existingOffer = pendingOffersRef.current.find(p => p.peerId === peerId)
      if (!existingOffer) {
        pendingOffersRef.current.push({ peerId, sdp: data.sdp })
        console.log(`Peer ${peerId} offer queued - local stream not ready`)
      }
      return
    }

    if (config.isCleaningUp.current) return

    let pc: RTCPeerConnection | null = peerConnectionsRef.current.get(peerId) ?? null
    if (!pc) {
      console.log(`Peer ${peerId} creating new connection for incoming offer`)
      pc = await createPeerConnection(peerId)
      if (!pc) return
    }

    const sigState = getSignalingState(peerId)
    const polite = (config.socketIdRef.current || "") < peerId

    const readyForOffer = !sigState.makingOffer
    const offerCollision = readyForOffer === false

    sigState.ignoreOffer = !polite && offerCollision
    if (sigState.ignoreOffer) {
      console.log(`Peer ${peerId} ignoring offer due to collision (impolite peer)`)
      return
    }

    try {
      if (offerCollision) {
        console.log(`Peer ${peerId} handling offer collision with rollback`)
        await pc.setLocalDescription({ type: "rollback" } as RTCSessionDescription)
      }

      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      console.log(`Peer ${peerId} set remote description (offer) successfully`)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      console.log(`Peer ${peerId} created and set answer`)
      await sendLocalDescription(peerId)
      console.log(`Peer ${peerId} sent answer`)
    } catch (err) {
      console.error(`Peer ${peerId} handle offer error:`, err)
    }
  }, [])

  const handleAnswer = useCallback(async (data: { senderPeerId: string; sdp: RTCSessionDescriptionInit }) => {
    const peerId = data.senderPeerId
    const pc = peerConnectionsRef.current.get(peerId)
    if (!pc) {
      console.warn(`Peer ${peerId} received answer but no peer connection exists`)
      return
    }

    try {
      console.log(`Peer ${peerId} setting remote description (answer):`, data.sdp.type)
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      console.log(`Peer ${peerId} set remote description (answer) successfully, connection state:`, pc.connectionState)
    } catch (err) {
      console.error(`Peer ${peerId} handle answer error:`, err)
    }
  }, [])

  const handleIceCandidate = useCallback(async (data: { senderPeerId: string; candidate: RTCIceCandidateInit }) => {
    const peerId = data.senderPeerId
    const pc = peerConnectionsRef.current.get(peerId)

    if (pc && data.candidate) {
      try {
        console.log(`Peer ${peerId} adding ICE candidate:`, data.candidate)
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
        console.log(`Peer ${peerId} ICE candidate added successfully`)
      } catch (err) {
        console.error(`Peer ${peerId} failed to add ICE candidate:`, err, data.candidate)
      }
    } else if (data.candidate) {
      console.log(`Peer ${peerId} buffering ICE candidate (no peer connection yet)`)
      if (!pendingIceCandidatesRef.current.has(peerId)) {
        pendingIceCandidatesRef.current.set(peerId, [])
      }
      pendingIceCandidatesRef.current.get(peerId)!.push(data.candidate)
    } else {
      console.log(`Peer ${peerId} received end of ICE candidates`)
    }
  }, [])

  const processPendingOffers = useCallback(async () => {
    const offers = [...pendingOffersRef.current]
    pendingOffersRef.current = []

    for (const pending of offers) {
      await handleOffer({ senderPeerId: pending.peerId, sdp: pending.sdp })
    }

    const peers = [...pendingPeersRef.current]
    pendingPeersRef.current = []

    for (const peer of peers) {
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
    peerTimeoutsRef.current.forEach(timeouts => {
      if (timeouts.connecting) clearTimeout(timeouts.connecting)
      if (timeouts.checking) clearTimeout(timeouts.checking)
    })
    peerTimeoutsRef.current.clear()
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
