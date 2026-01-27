import {WebSocketServer,WebSocket} from "ws";
import express from 'express';

const app=express();
app.use(express.static("public")); // Serve HTML/JS files
const httpServer=app.listen(8080);


type roomStore={
    [roomId:string]:{
        users:{
            [userId:string]:WebSocket
        }
    }

}
const room:roomStore={}
//roomId → (userId → socket)
const wss=new WebSocketServer({server:httpServer});
wss.on('connection',(ws)=>{
    ws.on('error',console.error);
    ws.on("message",(msg)=>{
        const data=JSON.parse(msg.toString());

        //upon joining the room
        if(data.type=="join_room"){
            console.log("the user wanna join the room",data);
            const {roomId,userId}=data;
          
                if (!room[roomId]) {
                    room[roomId] = { users: {} }
                  }
           

            room[roomId].users[userId]=ws;

            for(const uid in room[roomId].users[userId]){
                if(uid!=userId){
                    
                    room[roomId].users[userId].send(JSON.stringify({
                        type:"join-room",
                        userId,
                        message:"User has joined the room"}))
            }
                }
        }

        //upon leaving the room
        if(data.type=="leave_room"){
            const {roomId,userId}=data;
          
                if (!room[roomId]) {
                    return
                }
                //deleting the connection
                delete room[roomId].users[userId];

                //sending evryone who leaves a message
                for(const uid in room[roomId].users[userId]){
                    if(uid!=userId){
                        
                        room[roomId].users[userId].send(JSON.stringify({
                            type:"user-left",
                            userId,
                            message:"User has joined the room"}))
                }
                    }

        }
    })


    //modify the method to enable data sharing
    //ws.on("meesage",function message(data){ console.log("received",data.toStrinng)});
    
    
    //send initail message to the client
    ws.send("hello, from the server");
});