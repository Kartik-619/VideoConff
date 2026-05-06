'use client'

interface Props {
  participantCount: number
  connectionStatus: string
}

export function MeetingHeader({ participantCount, connectionStatus }: Props) {
  return (
    <>
      <div className="absolute top-4 right-4 text-white bg-black/60 px-3 py-1 rounded z-10">
        participants:{participantCount}
      </div>
      <div className="absolute top-4 left-4 text-white bg-black/60 px-3 py-1 rounded z-10">
        {connectionStatus}
      </div>
    </>
  )
}
