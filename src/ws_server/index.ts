import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';

const wsServer = http.createServer();

const wss = new WebSocketServer({ server: wsServer });

const rooms:any = [];

const players:any = [];

const games:any = {};

const connectionData = new Map();

let playerIndex = 0;
let gameIndex = 0;
let playerCount = 0;
let playersIds: string[];
let randomPlayerIndex: number;

wss.on('connection', (ws) => {
  ws.on('message', (message:any) => {
    console.log(`Received message: ${message}`); 
    let messag=JSON.parse(message);
    
    if (messag['type'] === 'reg'){
      let data = JSON.parse(messag.data);
      let player = {
        index: randomUUID(),
        name: data.name,
        password: data.password,
      };
      players.push(player);

      connectionData.set(ws, { data: player });

      ws.send(JSON.stringify({
        type: "reg",
        data:
            JSON.stringify({
                name: data.name,
                index:  player.index,
                error: false,
                errorText: ' ',
            }),
        id: 0
      }));
      if (players.length > 1){
        playerIndex += 1;
      }
      wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "update_room",
            data: JSON.stringify(rooms),
            id: 0,
          }));
          client.send(JSON.stringify({
            type: "update_winners",
            data: JSON.stringify(rooms),
            id: 0,
          }));
        }
      });
    }else if (messag['type'] === 'create_room'){
      let room: {roomId:string, roomUsers: any[]} = {
        roomId: randomUUID(),
        roomUsers: [],
      };
      const wsConn = connectionData.get(ws);
      room.roomUsers.push({name: wsConn.data.name, index: wsConn.data.index});
      rooms.push(room);
      ws.send(JSON.stringify({
          type: "update_room",
          data: JSON.stringify(rooms),
          id: 0,
      }));
    }else if (messag['type'] === 'add_user_to_room'){
      let data = JSON.parse(messag.data);
      let roomIndex = rooms.findIndex((room:any) => room.roomId === data.indexRoom);
      let room = rooms[roomIndex];
      if (room.roomUsers.length < 2){
        const wsConn = connectionData.get(ws);
        room.roomUsers.push({name: wsConn.data.name, index: wsConn.data.index});
        rooms.splice(roomIndex, 1);
        let gameId = randomUUID();
        
        games[gameId] = {};

        wss.clients.forEach(function each(client) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "update_room",
                data: JSON.stringify(rooms),
                id: 0,
            }));
            let user = connectionData.get(client);
            client.send(JSON.stringify({
              type: 'create_game',
              data:
                  JSON.stringify({
                      idGame: gameId,  
                      idPlayer: user.data.index,
                  })
            }));
          }
        });
      }
    }else if (messag['type'] === 'add_ships'){
      let data = JSON.parse(messag.data);
      console.log(data);
      playerCount += 1;
      games[data.gameId][data.indexPlayer] = {
        ships: data.ships,
      };
      if (playerCount === 2){
        playersIds = Object.keys(games[data.gameId]);
        randomPlayerIndex = Math.floor(Math.random() * playersIds.length);
        console.log('random player index is: ',randomPlayerIndex);
        wss.clients.forEach(function each(client) {
          if (client.readyState === WebSocket.OPEN) {
            let user = connectionData.get(client);

            client.send(JSON.stringify({
                type: "start_game",
                data: JSON.stringify({
                  ships: games[data.gameId][user.data.index].ships,
                  currentPlayerIndex: user.data.index
                }),
                id: 0,
            }));
            client.send(JSON.stringify({
                type: "turn",
                data: JSON.stringify({
                        currentPlayer: playersIds[randomPlayerIndex]
                    }),
                id: 0,
            }));
          }
        });
        playerCount = 0;

      }
    }else if (messag['type'] === 'attack'){
      let data = JSON.parse(messag.data);
      console.log('attack data: ',data);
    }
  });
});


function deepParse(obj:any) {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      try {
        obj[key] = JSON.parse(obj[key]);
        deepParse(obj[key]);
      } catch (e) {
        // Not JSON, leave as is
      }
    } else if (typeof obj[key] === 'object') {
      deepParse(obj[key]);
    }
  }
}



export { wsServer };