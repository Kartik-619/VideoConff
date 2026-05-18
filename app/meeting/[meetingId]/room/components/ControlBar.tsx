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
    <div className="absolute bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 flex gap-2 md:gap-4 bg-black/70 px-4 py-3 md:px-8 md:py-4 rounded-full z-10">
      <button
        onClick={onToggleMute}
        className="bg-gray-700 p-2 md:p-3 rounded-full text-white hover:bg-gray-600 transition"
      >
        {isMuted ? <FaMicrophoneSlash className="text-sm md:text-base" /> : <FaMicrophone className="text-sm md:text-base" />}
      </button>

      <button
        onClick={onToggleCamera}
        className="bg-gray-700 p-2 md:p-3 rounded-full text-white hover:bg-gray-600 transition"
      >
        {cameraOff ? <FaVideoSlash className="text-sm md:text-base" /> : <FaVideo className="text-sm md:text-base" />}
      </button>

      <button
        onClick={onToggleChat}
        className={`p-2 md:p-3 rounded-full text-white transition ${chatOpen ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
      >
        <MessageSquare size={18} className="md:hidden" />
        <MessageSquare size={20} className="hidden md:block" />
      </button>

      <button
        onClick={onToggleScreenShare}
        className={`p-2 md:p-3 rounded-full text-white transition ${screenSharing ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}`}
      >
        <FaDesktop className="text-sm md:text-base" />
      </button>

      <button
        onClick={handleEndMeeting}
        className="bg-red-600 p-2 md:p-3 rounded-full text-white hover:bg-red-700 transition"
      >
        <FaPhoneSlash className="text-sm md:text-base" />
      </button>
    </div>
  )
}
