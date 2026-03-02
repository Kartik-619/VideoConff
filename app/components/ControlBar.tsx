'use client';

interface Props {
  isHost: boolean;
  onToggleLayout: () => void;
  layout: 'speaker' | 'grid';
  onLeave: () => void;
  onEnd?: () => void;
}

export default function ControlBar({
  isHost,
  onToggleLayout,
  layout,
  onLeave,
  onEnd,
}: Props) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white shadow-xl rounded-full px-8 py-4 flex gap-6 items-center">

      <button>🎤</button>
      <button>📷</button>
      <button>🖥</button>

      <button onClick={onToggleLayout}>
        {layout === 'grid' ? 'Speaker View' : 'Grid View'}
      </button>

      <button
        onClick={onLeave}
        className="bg-red-500 text-white px-4 py-2 rounded-full"
      >
        Leave
      </button>

      {isHost && (
        <button
          onClick={onEnd}
          className="bg-red-700 text-white px-4 py-2 rounded-full"
        >
          End
        </button>
      )}
    </div>
  );
}