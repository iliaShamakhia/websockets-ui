import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { cellsFromShip, genIndex, neighborCellsForShip, sendJSON, updateRoomsBroadcast, updateWinnersBroadcast } from './utils.ts';
import type { Game, GamePlayer, Room, WS } from './types.ts';
import { games, players, playersByIndex, rooms } from './data.ts';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const wsServer = http.createServer();
const wss = new WebSocketServer({ server: wsServer }, () => {
  console.log(`WebSocket server started on port ${PORT}`);
});

wss.on('connection', (ws: WS) => {
  console.log('new ws connection established');
  let boundPlayerName: string | null = null;

  ws.on('message', (message: Buffer) => {
    let msgStr = '';
    msgStr = message.toString();

    console.log('<-', msgStr);

    let msg: any;
    try {
      msg = JSON.parse(msgStr);
    } catch (e) {
      sendJSON(ws, { type: 'error', data: { errorText: 'invalid json' }, id: 0 });
      return;
    }

    let { type, data } = msg;
    data = data && JSON.parse(data);

    if (type === 'reg') {

      const { name, password } = data;

      if (!name || !password) {
        sendJSON(ws, { type: 'reg', data: { name, index: null, error: true, errorText: 'missing fields' }, id: 0 });
        return;
      }

      let player = players.get(name);

      if (!player) {
        const index = genIndex('p_');
        player = { name, password, index, wins: 0, socket: ws };
        players.set(name, player);
        playersByIndex.set(index, player);
      } else {
        if (player.password !== password) {
          sendJSON(ws, { type: 'reg', data: { name, index: null, error: true, errorText: 'wrong password' }, id: 0 });
          return;
        }
        player.socket = ws;
      }

      boundPlayerName = name;

      sendJSON(ws, { type: 'reg', data: { name, index: player.index, error: false, errorText: '' }, id: 0 });
      updateWinnersBroadcast(players);
      updateRoomsBroadcast(rooms, players);

    } else if (type === 'create_room') {

      if (!boundPlayerName) {
        sendJSON(ws, { type: 'error', data: 'not logged in', id: 0 });
        return;
      }

      const player = players.get(boundPlayerName)!;
      const roomId = genIndex('r_');
      const room: Room = { roomId, roomUsers: [{ name: player.name, index: player.index }] };
      rooms.set(roomId, room);
      updateRoomsBroadcast(rooms, players);

    } else if (type === 'add_user_to_room') {

      if (!boundPlayerName) {
        sendJSON(ws, { type: 'error', data: 'not logged in', id: 0 });
        return;
      }

      const { indexRoom } = data;
      const room = rooms.get(indexRoom);

      if (!room) {
        sendJSON(ws, { type: 'error', data: 'room not found', id: 0 });
        return;
      }

      if (room.roomUsers.length >= 2) {
        sendJSON(ws, { type: 'error', data: 'room full', id: 0 });
        return;
      }

      const player = players.get(boundPlayerName)!;

      if (room.roomUsers.some(user => user.index === player.index)){
        return;
      }
      
      room.roomUsers.push({ name: player.name, index: player.index });

      const idGame = genIndex('g_');
      const game: Game = { idGame, players: new Map() };
  
      for (const u of room.roomUsers) {
        const idPlayer = u.index;
        const gp: GamePlayer = { idPlayer, playerIndex: u.index, killedShipsCount: 0 };
        game.players.set(idPlayer, gp);
        
        const rec = playersByIndex.get(u.index);
        if (rec && rec.socket && rec.socket.readyState === WebSocket.OPEN) {
          sendJSON(rec.socket, { type: 'create_game', data: { idGame, idPlayer }, id: 0 });
        }
      }

      games.set(idGame, game);
      room.gameId = idGame;

      rooms.delete(room.roomId);
      updateRoomsBroadcast(rooms, players);

    } else if (type === 'add_ships') {

      const { gameId, ships, indexPlayer } = data;
      const game = games.get(gameId);
      if (!game) {
        sendJSON(ws, { type: 'error', data: 'game not found', id: 0 });
        return;
      }

      const gp = Array.from(game.players.values()).find(p => p.playerIndex === indexPlayer);
      if (!gp) {
        sendJSON(ws, { type: 'error', data: 'player not in game', id: 0 });
        return;
      }

      gp.ships = ships;
      gp.shipCells = new Set<string>();
      for (const s of ships) {
        for (const c of cellsFromShip(s)){
          gp.shipCells.add(c);
        }
      }
     
      const allPlaced = Array.from(game.players.values()).every(p => p.ships && p.shipCells && p.shipCells.size > 0);
      if (allPlaced) {
      
        const playerIds = Array.from(game.players.keys());
        const currentPlayerId = playerIds[Math.floor(Math.random() * playerIds.length)];
        game.currentPlayerId = currentPlayerId;
        
        for (const [idPlayer, gpItem] of game.players.entries()) {
          const pr = playersByIndex.get(gpItem.playerIndex);
          if (pr && pr.socket && pr.socket.readyState === WebSocket.OPEN) {
            sendJSON(pr.socket, { type: 'start_game', data: { ships: gpItem.ships, currentPlayerIndex: game.currentPlayerId }, id: 0 });
            sendJSON(pr.socket, { type: 'turn', data: { currentPlayer: game.currentPlayerId }, id: 0 });
          }
        }
      } else {
        sendJSON(ws, { type: 'add_ships', data: { ok: true }, id: 0 });
      }
    } else if (type === 'attack' || type === 'randomAttack') {

      const isRandom = type === 'randomAttack';
      const { gameId, x, y, indexPlayer } = data;
      const game = games.get(gameId);
      if (!game) {
        sendJSON(ws, { type: 'error', data: 'game not found', id: 0 });
        return;
      }

      const shooter = Array.from(game.players.values()).find(p => p.playerIndex === indexPlayer);
      if (!shooter) {
        sendJSON(ws, { type: 'error', data: 'player not in game', id: 0 });
        return;
      }

      if (game.currentPlayerId && game.currentPlayerId !== shooter.idPlayer) {
        sendJSON(ws, { type: 'turn', data: { currentPlayer: game.currentPlayerId }, id: 0 });
        return;
      }

      const opponent = Array.from(game.players.values()).find(p => p.idPlayer !== shooter.idPlayer)!;

      if (!opponent.shipCells) {
        sendJSON(ws, { type: 'error', data: 'opponent ships not ready', id: 0 });
        return;
      }

      let tx = x, ty = y;
     
      if (isRandom) {
        tx = Math.floor(Math.random() * 10);
        ty = Math.floor(Math.random() * 10);
      }

      const key = `${tx},${ty}`;
      let status: 'miss'|'shot'|'killed' = 'miss';
      if (opponent.shipCells.has(key)) {

        opponent.shipCells.delete(key);
        status = 'shot';

        if (opponent.ships) {
          for (const s of opponent.ships) {
            const sc = cellsFromShip(s);
            const alive = sc.some(c => opponent.shipCells!.has(c));
            if (!alive && sc.includes(key)) {
              status = 'killed';
              opponent.killedShipsCount = (opponent.killedShipsCount || 0) + 1;
              const neigh = neighborCellsForShip(s);
              for (const n of neigh) {
                const [nx, ny] = n.split(',').map(Number);
                for (const gpItem of game.players.values()) {
                  const pr = playersByIndex.get(gpItem.playerIndex);
                  if (pr && pr.socket && pr.socket.readyState === WebSocket.OPEN) {
                    sendJSON(pr.socket, { type: 'attack', data: { position: { x: nx, y: ny }, currentPlayer: shooter.idPlayer, status: 'miss' }, id: 0 });
                  }
                }
              }
              break;
            }
          }
        }
      } else {
        status = 'miss';
      }

      for (const gpItem of game.players.values()) {
        const pr = playersByIndex.get(gpItem.playerIndex);

        if (pr && pr.socket && pr.socket.readyState === WebSocket.OPEN) {
          sendJSON(pr.socket, { type: 'attack', data: { position: { x: tx, y: ty }, currentPlayer: shooter.idPlayer, status }, id: 0 });
        }
      }

      if (status === 'miss') {
        const other = Array.from(game.players.keys()).find(id => id !== shooter.idPlayer)!;
        game.currentPlayerId = other;
      } else {
        game.currentPlayerId = shooter.idPlayer;
      }

      for (const gpItem of game.players.values()) {
        const pr = playersByIndex.get(gpItem.playerIndex);
        if (pr && pr.socket && pr.socket.readyState === WebSocket.OPEN) {
          sendJSON(pr.socket, { type: 'turn', data: { currentPlayer: game.currentPlayerId }, id: 0 });
        }
      }
 
      const oppRemaining = opponent.shipCells.size;

      if (oppRemaining === 0) {
        const winnerPlayer = playersByIndex.get(shooter.playerIndex);
        if (winnerPlayer) { winnerPlayer.wins += 1; }
        game.finished = true;

        for (const gpItem of game.players.values()) {
          const pr = playersByIndex.get(gpItem.playerIndex);

          if (pr && pr.socket && pr.socket.readyState === WebSocket.OPEN) {
            sendJSON(pr.socket, { type: 'finish', data: { winPlayer: shooter.idPlayer }, id: 0 });
          }
        }
        updateWinnersBroadcast(players);
      }
    } else {
      sendJSON(ws, { type: 'error', data: 'unknown command', id: 0 });
    }
  });

  ws.on('close', () => {
    console.log('ws closed for', boundPlayerName);
    if (boundPlayerName) {
      const p = players.get(boundPlayerName);
      if (p) p.socket = null;
    }
  });
});

wss.on('listening', () => {
  console.log('wss listening');
});

function gracefulShutdown() {
  console.log('Shutting down websocket server gracefully...');
  wss.clients?.forEach((c:any) => {
    try { c.close(); } catch (e) {}
  });
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export { wsServer };