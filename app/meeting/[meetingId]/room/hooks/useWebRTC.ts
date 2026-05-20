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
  const inboundStreamsRef = useRef<Map<string, MediaStream>>(new Map())

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
    inboundStreamsRef.current.delete(peerId)
    config.onClosePeerConnection(peerId)
  }, [])

  const processBufferedIceCandidates = useCallback(async (peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId)
    if (!pc || !pc.remoteDescription) return

    const candidates = pendingIceCandidatesRef.current.get(peerId) || []
    if (candidates.length === 0) return

    console.log(`Peer ${peerId} processing ${candidates.length} buffered ICE candidates`)
    pendingIceCandidatesRef.current.delete(peerId)

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        console.error(`Peer ${peerId} failed to add buffered ICE candidate:`, err)
      }
    }
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
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    })

    peerConnectionsRef.current.set(peerId, pc)
    signalingStateRef.current.set(peerId, { makingOffer: false, ignoreOffer: false })

    pc.ontrack = (event) => {
      console.log(`Peer ${peerId} received remote track:`, event.track.kind, event.track.id)
      const streamFromEvent = event.streams?.[0]
      const stream = streamFromEvent ?? inboundStreamsRef.current.get(peerId) ?? new MediaStream()
      if (!inboundStreamsRef.current.has(peerId)) {
        inboundStreamsRef.current.set(peerId, stream)
      }

      if (!streamFromEvent && event.track && !stream.getTracks().some(track => track.id === event.track.id)) {
        stream.addTrack(event.track)
      }

      config.onAppendRemoteStream(peerId, stream)
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && config.wsRef.current?.readyState === WebSocket.OPEN) {
        console.debug(`Peer ${peerId} sending ICE candidate`)
        config.wsRef.current.send(JSON.stringify({
          type: "ice-candidate",
          candidate: event.candidate,
          targetPeerId: peerId,
        }))
      }
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      console.log(`Peer ${peerId} connection state: ${state}`)
      const timeouts = peerTimeoutsRef.current.get(peerId) || {}

      if (state === 'connecting') {
        if (timeouts.connecting) clearTimeout(timeouts.connecting)
        timeouts.connecting = setTimeout(() => {
          if (pc.connectionState === 'connecting') {
            console.warn(`Peer ${peerId} connection stuck in 'connecting' for 8s, restarting ICE...`)
            pc.restartIce()
            const sigState = getSignalingState(peerId)
            if (!sigState.makingOffer) {
              ;(async () => {
                try {
                  sigState.makingOffer = true
                  const offer = await pc.createOffer()
                  await pc.setLocalDescription(offer)
                  await sendLocalDescription(peerId)
                } catch (err) {
                  console.error(`Peer ${peerId} connection timeout re-offer error:`, err)
                } finally {
                  sigState.makingOffer = false
                }
              })()
            }
          }
        }, 8000)
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
              inboundStreamsRef.current.delete(peerId)
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
              // error handled
            } finally {
              sigState.makingOffer = false
            }
          })()
        }
      }

      if (state === 'checking') {
        if (timeouts.checking) clearTimeout(timeouts.checking)
        timeouts.checking = setTimeout(() => {
          if (pc.iceConnectionState === 'checking') {
            console.log(`Peer ${peerId} ICE checking timeout, restarting ICE...`)
            pc.restartIce()
            const sigState = getSignalingState(peerId)
            if (!sigState.makingOffer) {
              ;(async () => {
                try {
                  sigState.makingOffer = true
                  const offer = await pc.createOffer()
                  await pc.setLocalDescription(offer)
                  await sendLocalDescription(peerId)
                } catch (err) {
                  console.error(`Peer ${peerId} ICE restart offer error:`, err)
                } finally {
                  sigState.makingOffer = false
                }
              })()
            }
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
        await sendLocalDescription(peerId)
      } catch (err) {
        console.error(`Peer ${peerId} negotiation error:`, err)
      } finally {
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

    // Perfect Negotiation: We rely on onnegotiationneeded to trigger the offer.
    // If we are already in a negotiation, we don't need to do anything here.
    // The createPeerConnection call above already added tracks, which triggers onnegotiationneeded.
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

    // Perfect Negotiation collision detection
    const offerCollision = sigState.makingOffer || pc.signalingState !== "stable"

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
      
      await processBufferedIceCandidates(peerId)

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      console.log(`Peer ${peerId} created and set answer`)
      await sendLocalDescription(peerId)
      console.log(`Peer ${peerId} sent answer`)
    } catch (err) {
      console.error(`Peer ${peerId} handle offer error:`, err)
    } finally {
      sigState.makingOffer = false
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
      
      await processBufferedIceCandidates(peerId)
    } catch (err) {
      console.error(`Peer ${peerId} handle answer error:`, err)
    }
  }, [])

  const handleIceCandidate = useCallback(async (data: { senderPeerId: string; candidate: RTCIceCandidateInit }) => {
    const peerId = data.senderPeerId
    const pc = peerConnectionsRef.current.get(peerId)

    if (pc && pc.remoteDescription && data.candidate) {
      try {
        console.log(`Peer ${peerId} adding ICE candidate:`, data.candidate)
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
        console.log(`Peer ${peerId} ICE candidate added successfully`)
      } catch (err) {
        console.error(`Peer ${peerId} failed to add ICE candidate:`, err, data.candidate)
      }
    } else if (data.candidate) {
      console.log(`Peer ${peerId} buffering ICE candidate (no connection or remote description)`)
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
    inboundStreamsRef.current.clear()
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
