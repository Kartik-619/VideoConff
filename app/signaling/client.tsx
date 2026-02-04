"use client"


import { useRef,useEffect, useState } from "react";

export default function ClientSignal(){
    const wsRef=useRef<WebSocket|null>(null); 
     const [IsConnected,setConnected]=useState(false);
    // 
useEffect( ()=>{
    const ws = new WebSocket('ws://localhost:8080');
    wsRef.current=ws;

 

    ws.onopen=()=>{

        console.log("Connected to Server");
        setConnected(true);

        ws.send(JSON.stringify({
            type:'join_room',
            roomId:'general',
            userId:`user_${Math.random().toString(36).substring(2, 9)}`
        }));

}
    ws.onmessage=(e)=>{
        console.log("Message Received :",e.data);

        ws.send(JSON.stringify({
            type:'offer',
            roomId:'general',
            userId:`user_${Math.random().toString(36).substring(2, 9)}`

        }));
    }

    ws.onerror=(err)=>{
        console.error("websocket error", err);
        setConnected(false);
    }

    ws.onclose=()=>{
        console.log("Disconnected from sevrer");
        setConnected(false);
    };

    return ()=>{
        if(ws.readyState===WebSocket.OPEN){
            ws.close();
        }
    }

},[] ); //empty array=run once on mount



        
         return (<div>{IsConnected ? "Connected" : "Connecting..."}</div>)
       
    
}