'use client';

import { useEffect, useRef, useState } from "react";
import UserAvatar from "./UserAvatar";

interface Props {
  stream: MediaStream;
  muted?: boolean;
  isVideoOff?: boolean;
  userName?: string;
  userImage?: string;
  isLocal?: boolean;
}

export default function VideoTile({ 
  stream, 
  muted, 
  isVideoOff = false, 
  userName, 
  userImage, 
  isLocal = false 
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);

  useEffect(() => {
    const video = ref.current;
    if (!video || !stream) return;

    video.srcObject = stream;

    const handleTrackChange = () => {
      const tracks = stream.getVideoTracks();
      const enabled = tracks.length > 0 && tracks[0]!.enabled;
      setVideoEnabled(enabled);
      if (enabled) {
        video.play().catch(() => {});
      }
    };

    handleTrackChange();

    const tracks = stream.getTracks();
    tracks.forEach(track => {
      track.addEventListener('ended', handleTrackChange);
      track.addEventListener('mute', handleTrackChange);
      track.addEventListener('unmute', handleTrackChange);
    });

    video.play().catch(() => {});

    return () => {
      tracks.forEach(track => {
        track.removeEventListener('ended', handleTrackChange);
        track.removeEventListener('mute', handleTrackChange);
        track.removeEventListener('unmute', handleTrackChange);
      });
    };
  }, [stream]);

  const showVideo = videoEnabled && !isVideoOff;

  return (
    <div className="relative w-full h-full bg-black rounded-xl overflow-hidden">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: isLocal ? "scaleX(-1)" : "none",
          display: showVideo ? "block" : "none"
        }}
        className="w-full h-full object-cover"
      />
      
      {(!showVideo) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
          <UserAvatar 
            userName={userName} 
            userImage={userImage}
            size="lg"
            className="transform hover:scale-105 transition-transform duration-200"
          />
        </div>
      )}
      
      {(!showVideo) && (
        <div className="absolute top-3 left-3 bg-red-600 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
          Video Off
        </div>
      )}
      
      <div className="absolute bottom-3 left-3 bg-black/60 text-white px-2 py-1 rounded-md text-xs font-medium">
        {userName || (isLocal ? "You" : "Participant")}
      </div>
    </div>
  );
}