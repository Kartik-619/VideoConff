import {WebSocketServer} from "ws";
import express from 'express';

const app=express();
app.use(express.static("public")); // Serve HTML/JS files
const httpServer=app.listen(8080);

const wss=new WebSocketServer({server:httpServer});
wss.on('connection',function connection(ws){
    ws.on('error',console.error);

    //modify the method to enable data sharing
    //ws.on("meesage",function message(data){ console.log("received",data.toStrinng)});
    
    
    //send initail message to the client
    ws.send("hello, from the server");
});