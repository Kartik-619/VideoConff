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
    let currentRoomId: string | null = null
    let currentUserId: string | null = null
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

            for(const uid in room[roomId].users){
                if(uid!=userId){
                    
                    room[roomId].users[uid].send(JSON.stringify({
                        type:"join_room",
                        userId,
                        message:"User has joined the room"}))
            }
                }
        }

        //upon leaving the room
        if(data.type=="leave_room"){
           leaveRoom();

        }
    })

    ws.on("close",()=>{
        leaveRoom();
    })
    

    function leaveRoom() {
        //checking if user is in the room
        //return if user is not there cause you can't remove someone unavailable
        if (!currentRoomId || !currentUserId) return
    
        //get the room's data from the store
        const r = room[currentRoomId]
        //if there is no data return
        if (!r) return
    //delete the userId from the roomstore
        delete r.users[currentUserId]
    
        //notify other users that someone has left
        for (const uid in r.users) {
          r.users[uid].send(JSON.stringify({
            type: "user-left",
            userId: currentUserId
          }))
        }
        
        //delete the room if empty
        if (Object.keys(r.users).length === 0) {
          delete room[currentRoomId]
        }
        

        //reset the local state
        currentRoomId = null
        currentUserId = null
      }
   
});