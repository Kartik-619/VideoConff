'use client';

import { useEffect, useRef, useState } from "react";
import UserAvatar from "./UserAvatar";

interface Props {
  stream: MediaStream;
  isVideoOff?: boolean;
  userName?: string;
  userImage?: string;
  isLocal?: boolean;
}

export default function VideoTile({ 
  stream, 
  isVideoOff = false, 
  userName, 
  userImage, 
  isLocal = false 
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [hasVideoTrack, setHasVideoTrack] = useState(true);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    video.srcObject = stream;

    const checkVideo = () => {
      const tracks = stream.getVideoTracks();
      const hasTrack = tracks.length > 0 && tracks[0]!.enabled;
      setHasVideoTrack(hasTrack);
      if (hasTrack) {
        video.play().catch(() => {});
      }
    };

    checkVideo();
    video.play().catch(() => {});

    const tracks = stream.getTracks();
    for (const track of tracks) {
      track.addEventListener('ended', checkVideo);
      track.addEventListener('mute', checkVideo);
      track.addEventListener('unmute', checkVideo);
    }
    stream.addEventListener('addtrack', checkVideo);
    stream.addEventListener('removetrack', checkVideo);

    return () => {
      for (const track of tracks) {
        track.removeEventListener('ended', checkVideo);
        track.removeEventListener('mute', checkVideo);
        track.removeEventListener('unmute', checkVideo);
      }
      stream.removeEventListener('addtrack', checkVideo);
      stream.removeEventListener('removetrack', checkVideo);
    };
  }, [stream]);

  const displayVideo = hasVideoTrack && !isVideoOff;

  return (
    <div className="relative w-full h-full bg-gray-900 rounded-xl overflow-hidden">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          display: displayVideo ? 'block' : 'none',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: isLocal ? 'scaleX(-1)' : 'none',
        }}
      />
      
      {!displayVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-900/50 to-purple-900/50">
          <UserAvatar 
            userName={userName} 
            userImage={userImage}
            size="lg"
          />
        </div>
      )}

      {!displayVideo && (
        <div className="absolute top-3 left-3 bg-red-500 text-white px-2 py-0.5 rounded-full text-xs font-semibold">
          Video Off
        </div>
      )}

      <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-sm font-medium">
        {userName || (isLocal ? 'You' : 'Participant')}
      </div>
    </div>
  );
}
