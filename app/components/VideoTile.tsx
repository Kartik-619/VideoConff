'use client';

interface Props {
  participant: any;
  large?: boolean;
}

export default function VideoTile({ participant, large }: Props) {
  return (
    <div
      className={`relative bg-slate-900 rounded-xl overflow-hidden ${
        large ? 'h-full' : 'h-full'
      }`}
    >
      <video
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />

      <div className="absolute bottom-2 left-2 text-white text-sm bg-black/50 px-2 py-1 rounded">
        {participant.name}
      </div>
    </div>
  );
}