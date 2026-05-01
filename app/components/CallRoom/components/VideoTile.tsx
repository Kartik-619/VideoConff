'use client';

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    if (ref.current && stream) {
        ref.current.srcObject = stream;

        ref.current.play().catch(() => {
        console.log("Autoplay blocked");
        });
    }
    }, [stream, stream?.getTracks().length]);

  return (
    <div className="relative w-full h-full bg-black rounded-xl overflow-hidden">
      {/* Video element - hidden when video is off */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: isLocal ? "scaleX(-1)" : "none",
          display: isVideoOff ? "none" : "block"
        }}
        className="w-full h-full object-cover"
      />
      
      {/* Avatar shown when video is off */}
      {isVideoOff && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
          <UserAvatar 
            userName={userName} 
            userImage={userImage}
            size="lg"
            className="transform hover:scale-105 transition-transform duration-200"
          />
        </div>
      )}
      
      {/* Video off indicator */}
      {isVideoOff && (
        <div className="absolute top-3 left-3 bg-red-600 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
          Video Off
        </div>
      )}
    </div>
  );
}