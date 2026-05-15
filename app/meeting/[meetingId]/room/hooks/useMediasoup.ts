/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import { useRef, useCallback } from "react"
import { Device } from "mediasoup-client"
import type { Transport, Producer, Consumer } from "mediasoup-client/lib/types"

interface UseMediasoupConfig {
  wsRef: React.MutableRefObject<WebSocket | null>
  onAppendRemoteStream: (peerId: string, stream: MediaStream) => void
  onRemoveRemoteStream: (peerId: string) => void
}

export function useMediasoup(config: UseMediasoupConfig) {
  const deviceRef = useRef<Device | null>(null)
  const sendTransportRef = useRef<Transport | null>(null)
  const recvTransportRef = useRef<Transport | null>(null)
  const producersRef = useRef<Map<string, Producer>>(new Map())
  const consumersRef = useRef<Map<string, Consumer>>(new Map())

  const createDevice = useCallback(async (rtpCapabilities: any) => {
    try {
      const device = new Device()
      await device.load({ rtpCapabilities })
      deviceRef.current = device
      console.log("Mediasoup Device loaded")
      return device
    } catch (error) {
      console.error("Failed to load device:", error)
      return null
    }
  }, [])

  const handleTransportCreated = useCallback(async (data: any) => {
    const { direction, id, iceParameters, iceCandidates, dtlsParameters } = data
    if (!deviceRef.current) return

    const transportOptions = {
      id,
      iceParameters,
      iceCandidates,
      dtlsParameters,
    }

    let transport: Transport
    if (direction === 'send') {
      transport = deviceRef.current.createSendTransport(transportOptions)
      sendTransportRef.current = transport
    } else {
      transport = deviceRef.current.createRecvTransport(transportOptions)
      recvTransportRef.current = transport
    }

    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      config.wsRef.current?.send(JSON.stringify({
        type: 'connectTransport',
        transportId: transport.id,
        dtlsParameters
      }))

      const handleConnected = (e: MessageEvent) => {
        const data = JSON.parse(e.data)
        if (data.type === 'transportConnected' && data.transportId === transport.id) {
          config.wsRef.current?.removeEventListener('message', handleConnected)
          callback()
        }
      }
      config.wsRef.current?.addEventListener('message', handleConnected)
    })

    if (direction === 'send') {
      transport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
        config.wsRef.current?.send(JSON.stringify({
          type: 'producer',
          transportId: transport.id,
          kind,
          rtpParameters
        }))

        const handleProduced = (e: MessageEvent) => {
          const data = JSON.parse(e.data)
          if (data.type === 'produced') {
            config.wsRef.current?.removeEventListener('message', handleProduced)
            callback({ id: data.data.producerId })
          }
        }
        config.wsRef.current?.addEventListener('message', handleProduced)
      })
    }

    console.log(`${direction} transport created`)
  }, [])

  const produce = useCallback(async (track: MediaStreamTrack) => {
    if (!sendTransportRef.current) {
        // Request send transport if not exists
        config.wsRef.current?.send(JSON.stringify({
            type: 'createTransport',
            direction: 'send'
        }));
        // Wait for it? or just return and wait for transportCreated
        return;
    }

    try {
      const producer = await sendTransportRef.current.produce({ track })
      producersRef.current.set(producer.id, producer)
      return producer
    } catch (error) {
      console.error("Produce error:", error)
    }
  }, [])

  const pendingConsumersRef = useRef<Map<string, string>>(new Map()) // producerId -> peerId

  const consume = useCallback(async (producerId: string, peerId: string) => {
    if (!deviceRef.current || !recvTransportRef.current) return

    pendingConsumersRef.current.set(producerId, peerId)
    config.wsRef.current?.send(JSON.stringify({
      type: 'consumer',
      producerId,
      transportId: recvTransportRef.current.id,
      rtpCapabilities: deviceRef.current.rtpCapabilities
    }))
  }, [])

  const handleConsumerCreated = useCallback(async (data: any) => {
    if (!recvTransportRef.current) return
    const { id, producerId, kind, rtpParameters } = data
    const peerId = pendingConsumersRef.current.get(producerId)
    if (!peerId) return

    try {
      const consumer = await recvTransportRef.current.consume({
        id,
        producerId,
        kind,
        rtpParameters,
      })
      consumersRef.current.set(consumer.id, consumer)

      const stream = new MediaStream([consumer.track])
      config.onAppendRemoteStream(peerId, stream)
      
      config.wsRef.current?.send(JSON.stringify({
        type: 'resumeConsumer',
        consumerId: consumer.id
      }))
      
      pendingConsumersRef.current.delete(producerId)
      return { consumer, stream }
    } catch (error) {
      console.error("Consume error:", error)
    }
  }, [])

  const cleanup = useCallback(() => {
    producersRef.current.forEach(p => p.close())
    consumersRef.current.forEach(c => c.close())
    sendTransportRef.current?.close()
    recvTransportRef.current?.close()
    producersRef.current.clear()
    consumersRef.current.clear()
    sendTransportRef.current = null
    recvTransportRef.current = null
    deviceRef.current = null
  }, [])

  return {
    createDevice,
    handleTransportCreated,
    produce,
    consume,
    handleConsumerCreated,
    cleanup
  }
}
