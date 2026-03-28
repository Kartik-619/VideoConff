'use client'

import { useRef,useEffect } from "react";

interface VideoTileProps{
    stream:MediaStream,
    muted?:boolean
}

export default function VideoTile({stream,muted}:VideoTileProps){
    const VideoRef=useRef<HTMLVideoElement|null>(null);
    useEffect(()=>{
        if(VideoRef.current){
            VideoRef.current.srcObject = stream;
        }
        return () => {
            if (VideoRef.current) {
                VideoRef.current.srcObject = null;
            }
        };
    },[stream]);

    return(
        <video
        ref={VideoRef}
        autoPlay
        muted={muted}
        playsInline
        className="w-full h-full object-cover"/>

        
    )
}