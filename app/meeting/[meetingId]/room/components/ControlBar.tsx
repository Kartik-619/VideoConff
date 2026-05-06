'use client'

import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaDesktop,
  FaPhoneSlash
} from "react-icons/fa"
import { MessageSquare } from "lucide-react"

interface Props {
  isMuted: boolean
  cameraOff: boolean
  chatOpen: boolean
  screenSharing: boolean
  isHost: boolean
  meetingId: string
  onToggleMute: () => void
  onToggleCamera: () => void
  onToggleChat: () => void
  onToggleScreenShare: () => void
  onLeave: () => void
}

export function MeetingControlBar({
  isMuted,
  cameraOff,
  chatOpen,
  screenSharing,
  isHost,
  meetingId,
  onToggleMute,
  onToggleCamera,
  onToggleChat,
  onToggleScreenShare,
  onLeave
}: Props) {
  const handleEndMeeting = async () => {
    if (isHost) {
      try {
        await fetch("/api/meeting/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId })
        })
      } catch {
      }
    }
    onLeave()
  }

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 bg-black/70 px-8 py-4 rounded-full z-10">
      <button
        onClick={onToggleMute}
        className="bg-gray-700 p-3 rounded-full text-white hover:bg-gray-600 transition"
      >
        {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
      </button>

      <button
        onClick={onToggleCamera}
        className="bg-gray-700 p-3 rounded-full text-white hover:bg-gray-600 transition"
      >
        {cameraOff ? <FaVideoSlash /> : <FaVideo />}
      </button>

      <button
        onClick={onToggleChat}
        className={`p-3 rounded-full text-white transition ${chatOpen ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
      >
        <MessageSquare size={20} />
      </button>

      <button
        onClick={onToggleScreenShare}
        className={`p-3 rounded-full text-white transition ${screenSharing ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}`}
      >
        <FaDesktop />
      </button>

      <button
        onClick={handleEndMeeting}
        className="bg-red-600 p-3 rounded-full text-white hover:bg-red-700 transition"
      >
        <FaPhoneSlash />
      </button>
    </div>
  )
}
