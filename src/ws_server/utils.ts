import type { PlayerRecord, Room, ShipSpec, WS } from "./types.ts";


export function genIndex(prefix: string = ''): string {
  return prefix + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
}

export function sendJSON(ws: WS, obj: any) {
  try {
    ws.send(JSON.stringify({
      ...obj,
      data: JSON.stringify(obj.data)
    }));
    console.log('->', JSON.stringify(obj));
  } catch (e) {
    console.error('send error', e);
  }
}

export function broadcastAll(obj: any, players: Map<string, PlayerRecord>) {
  const str = JSON.stringify({
    ...obj,
    data: JSON.stringify(obj.data)
  });
  console.log('->', str);
  for (const p of players.values()) {
    if (p.socket && p.socket.readyState === WebSocket.OPEN) {
      try { p.socket.send(str); } catch (e) {}
    }
  }
}

export function updateRoomsBroadcast(rooms: Map<string, Room>, players: Map<string, PlayerRecord>) {
  const list = Array.from(rooms.values()).filter(r => r.roomUsers.length > 0 && r.roomUsers.length < 2).map(r => ({
    roomId: r.roomId,
    roomUsers: r.roomUsers
  }));
  broadcastAll({ type: 'update_room', data: list, id: 0 }, players);
}

export function updateWinnersBroadcast(players: Map<string, PlayerRecord>) {
  const list = Array.from(players.values()).map(p => ({ name: p.name, wins: p.wins }));
  broadcastAll({ type: 'update_winners', data: list, id: 0 }, players);
}

export function cellsFromShip(shipSpec: ShipSpec) {
  const cells: string[] = [];
  const { x, y } = shipSpec.position;
  for (let i = 0; i < shipSpec.length; i++) {
    if (!shipSpec.direction) cells.push(`${x + i},${y}`); else cells.push(`${x},${y + i}`);
  }
  return cells;
}

export function neighborCellsForShip(shipSpec: ShipSpec) {
  const set = new Set<string>();
  const cells = cellsFromShip(shipSpec);
  for (const c of cells) {
    const [sx, sy] = c.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        set.add(`${sx + dx},${sy + dy}`);
      }
    }
  }
  return Array.from(set);
}