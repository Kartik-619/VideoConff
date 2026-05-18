'use client'

interface Props {
  participantCount: number
  connectionStatus: string
}

export function MeetingHeader({ participantCount, connectionStatus }: Props) {
  return (
    <>
      <div className="absolute top-2 md:top-4 right-2 md:right-4 text-white bg-black/60 px-2 md:px-3 py-0.5 md:py-1 rounded text-xs md:text-sm z-10">
        participants:{participantCount}
      </div>
      <div className="absolute top-2 md:top-4 left-2 md:left-4 text-white bg-black/60 px-2 md:px-3 py-0.5 md:py-1 rounded text-xs md:text-sm z-10">
        {connectionStatus}
      </div>
    </>
  )
}
