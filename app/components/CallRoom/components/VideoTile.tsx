'use client';

import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream;
  muted?: boolean;
}

export default function VideoTile({ stream, muted }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) {
        ref.current.srcObject = stream;

        ref.current.play().catch(() => {
        console.log("Autoplay blocked");
        });
    }
    }, [stream]);

  return (
    <div className="relative w-full h-full bg-black rounded-xl overflow-hidden">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scaleX(-1)" // only for local
        }}
        className="w-full h-full object-cover"
      />
    </div>
  );
}