export class TournamentRoom {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;
    try{this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping","pong"))}catch{}
  }
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==="/broadcast"&&request.method==="POST"){
      const message=await request.text();
      const sockets=this.ctx.getWebSockets();
      for(const ws of sockets){try{ws.send(message)}catch{}}
      return new Response(null,{status:204});
    }
    if(request.headers.get("Upgrade")!=="websocket")return new Response("Expected WebSocket",{status:426});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    this.ctx.acceptWebSocket(server);
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,message){
    if(String(message)==="ping"){try{ws.send("pong")}catch{}}
  }
  async webSocketClose(ws,code,reason){
    // Explicitly reciprocate closure, including runtimes which do not auto-reply.
    // Reserved diagnostic codes cannot be sent in a WebSocket Close frame.
    const replyCode=[1005,1006,1015].includes(code)?1000:code;
    try{ws.close(replyCode,reason||"")}catch{}
  }
  async webSocketError(){}
}

export async function broadcast(env,event,payload={},room="public"){
  const id=env.ROOMS.idFromName(String(room||"public"));
  const stub=env.ROOMS.get(id);
  await stub.fetch("https://room/broadcast",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({event,payload,at:new Date().toISOString()})
  });
}
