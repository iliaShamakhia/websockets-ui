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
        wins: 0,
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
      //console.log('data ships: ', data.ships.map((s:any) => s.position));
      /* let allShipPositions: any[] = [...data.ships];
      data.ships.forEach((ship:any) => {
        for (let i = 0; i < ship.length - 1; i++){
          if (ship.direction){
            allShipPositions.push({
              position: {x:ship.position.x, y: ship.position.y + i + 1},
              direction: ship.direction,
              type: ship.type,
              length: ship.length,
            })
          }else{
            allShipPositions.push({
              position: {x:ship.position.x + i + 1, y: ship.position.y},
              direction: ship.direction,
              type: ship.type,
              length: ship.length,
            })
          }
        }
      }); */
      //console.log('data ships after addition: ', allShipPositions.map((s:any) => s.position));
      playerCount += 1;
      games[data.gameId][data.indexPlayer] = {
        ships: data.ships,
      };
      if (playerCount === 2){
        playersIds = Object.keys(games[data.gameId]);
        randomPlayerIndex = Math.floor(Math.random() * playersIds.length);
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
      let opponentIndex = playersIds.findIndex(id => id !== data.indexPlayer);
      console.log('locations: ',data.x, data.y);
      console.log('opponent index: ', opponentIndex);
      console.log('oponent ships: ', games[data.gameId][playersIds[opponentIndex]]);
      let oponentShips = games[data.gameId][playersIds[opponentIndex]].ships
      console.log('oponent ships positions: ', oponentShips.filter((ship:any) => ship.position));
      
      let shipPos = oponentShips.find((ship:any) => {
        if (ship.direction){
          if ((data.y >= ship.position.y) && (data.y <= (data.y + ship.length))){
            return ship;
          }
        }else{
          if ((data.x >= ship.position.x) && (data.x <= (data.x + ship.length))){
            return ship;
          }
        }
        return undefined;
      });
      console.log('hit or miss: ', shipPos);
      if (shipPos){
        shipPos.length -= 1;
        let allSunk = oponentShips.every((ship:any) => ship.length === 0);
        if (allSunk){
          wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
              let winner = players.find((p:any) => p.index === data.indexPlayer).name
              let loser = players.find((p:any) => p.index === playersIds[opponentIndex]).name
              winner.wins += 1;
              client.send(JSON.stringify({
                  type: "finish",
                  data: JSON.stringify({
                    winPlayer: data.indexPlayer,
                  }),
                  id: 0,
              }));
              client.send(JSON.stringify({
                type: "update_winners",
                data: JSON.stringify([
                  {
                    name: winner.name,
                    wins: winner.wins,
                  },
                  {
                    name: loser.name,
                    wins: loser.wins,
                  }
                ]),
                id: 0,
              }));
            }
          });
          return;
        }
        if (shipPos.length === 0){{
          wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {

              client.send(JSON.stringify({
                  type: "attack",
                  data: JSON.stringify({
                    position: JSON.stringify({x: data.x, y: data.y}),
                    currentPlayer: data.indexPlayer,
                    status: 'killed',
                  }),
                  id: 0,
              }));
              client.send(JSON.stringify({
                  type: "turn",
                  data: JSON.stringify({
                          currentPlayer: playersIds[opponentIndex]
                      }),
                  id: 0,
              }));
            }
          });
          return;
        }
        console.log('oponent ships after hit: ', games[data.gameId][playersIds[opponentIndex]]);
        wss.clients.forEach(function each(client) {
          if (client.readyState === WebSocket.OPEN) {
            let user = connectionData.get(client);

            client.send(JSON.stringify({
                type: "attack",
                data: JSON.stringify({
                  position: {x: data.x, y: data.y},
                  currentPlayer: data.indexPlayer,
                  status: 'shot',
                }),
                id: 0,
            }));
            client.send(JSON.stringify({
                type: "turn",
                data: JSON.stringify({
                        currentPlayer: data.indexPlayer
                    }),
                id: 0,
            }));
          }
        });
      }else{
        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {

              client.send(JSON.stringify({
                  type: "attack",
                  data: JSON.stringify({
                    position: {x: data.x, y: data.y},
                    currentPlayer: data.indexPlayer,
                    status: 'miss',
                  }),
                  id: 0,
              }));
              client.send(JSON.stringify({
                  type: "turn",
                  data: JSON.stringify({
                          currentPlayer: playersIds[opponentIndex]
                      }),
                  id: 0,
              }));
            }
          });
      }
    }
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