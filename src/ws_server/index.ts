import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';

const wsServer = http.createServer();

const wss = new WebSocketServer({ server: wsServer });

wss.on('connection', (ws) => {
  ws.on('message', (message:any) => {
    console.log(`Received message: ${message}`);
    let messag=JSON.parse(message);
    console.log(messag);
    if (messag['type'] === 'reg'){
      ws.send(JSON.stringify({
        type: "reg",
        data:
            JSON.stringify({
                name: messag.name,
                index:  1,
                error: undefined,
                errorText: ' ',
            }),
        id: 0
      }));
    }else if (messag['type'] === 'create_room'){
      ws.send(JSON.stringify({
          type: "create_game",
          data:
              JSON.stringify({
                  idGame: 1,  
                  idPlayer: 1,
              }),
          id: 0,
      }));
    }
  });
});



export { wsServer };