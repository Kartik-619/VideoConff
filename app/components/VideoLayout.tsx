'use client';

import VideoTile from "./VideoTile";

type Participant = {
  id: string;
  name: string;
  stream?: MediaStream;
};

interface Props {
  participants: Participant[];
  layout: 'speaker' | 'grid';
  activeSpeaker: string | null;
}

export default function VideoLayout({
  participants,
  layout,
  activeSpeaker,
}: Props) {
  if (layout === 'grid') {
    return (
      <div className="grid grid-cols-3 gap-4 p-4 h-full">
        {participants.map((p) => (
          <VideoTile key={p.id} participant={p} />
        ))}
      </div>
    );
  }

  // Speaker View
  const main =
    participants.find((p) => p.id === activeSpeaker) ||
    participants[0];

  const others = participants.filter((p) => p.id !== main?.id);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 bg-black rounded-xl m-4">
        {main && <VideoTile participant={main} large />}
      </div>

      <div className="flex gap-4 px-4 pb-4 overflow-x-auto">
        {others.map((p) => (
          <div key={p.id} className="w-40 h-28">
            <VideoTile participant={p} />
          </div>
        ))}
      </div>
    </div>
  );
}