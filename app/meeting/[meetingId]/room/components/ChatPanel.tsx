'use client'

import { useEffect } from "react"
import { useSession } from "next-auth/react"
import type { ChatMessage } from "../types"

interface Props {
  messages: ChatMessage[]
  chatEndRef: React.MutableRefObject<HTMLDivElement | null>
  chatInputRef: React.MutableRefObject<HTMLInputElement | null>
  onSendMessage: (msg: string) => void
  onClose: () => void
}

export function ChatPanel({ messages, chatEndRef, chatInputRef, onSendMessage, onClose }: Props) {
  const { data: session } = useSession()

  useEffect(() => {
    chatInputRef.current?.focus()
  }, [chatInputRef])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, chatEndRef])

  const handleSend = () => {
    const input = chatInputRef.current
    if (!input) return
    const msg = input.value.trim()
    if (!msg) return
    onSendMessage(msg)
    input.value = ""
    input.focus()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f172a] text-white md:absolute md:inset-auto md:right-4 md:top-16 md:w-80 md:h-[420px] md:rounded-2xl md:shadow-2xl md:border md:border-gray-700 md:z-10 overflow-hidden">
      <div className="p-4 md:p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900">
        <span className="font-semibold text-base md:text-sm">Chat</span>
        <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:text-white transition-colors">
          <span className="text-2xl md:text-lg">&#x2715;</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
        {messages.map((msg, i) => {
          const isMe = msg.userId === session?.user?.id
          return (
            <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`px-4 py-2 rounded-2xl max-w-[85%] md:max-w-[75%] text-sm shadow-md ${
                isMe ? "bg-blue-600 text-white rounded-br-sm" : "bg-gray-700 text-gray-100 rounded-bl-sm"
              }`}>
                {!isMe && <div className="text-xs text-gray-400 mb-1 font-medium">{msg.name}</div>}
                <div className="break-words">{msg.text}</div>
              </div>
            </div>
          )
        })}
        <div ref={chatEndRef} />
      </div>
      <div className="p-4 md:p-3 border-t border-gray-700 flex gap-2 items-center bg-gray-900 md:bg-transparent">
        <input
          ref={chatInputRef}
          type="text"
          placeholder="Type a message..."
          className="flex-1 p-3 md:p-2 rounded-lg bg-gray-800 text-white outline-none text-base md:text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const msg = e.currentTarget.value.trim()
              if (!msg) return
              onSendMessage(msg)
              e.currentTarget.value = ""
              chatInputRef.current?.focus()
            }
          }}
        />
        <button
          onClick={handleSend}
          className="bg-blue-600 hover:bg-blue-700 px-6 md:px-4 py-3 md:py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}
