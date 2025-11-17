import WebSocket from 'ws';

export type WS = WebSocket;

export interface PlayerRecord {
  name: string;
  password: string;
  index: string;
  wins: number;
  socket?: WS | null;
}

export interface Room {
  roomId: string;
  roomUsers: { name: string; index: string }[];
  gameId?: string;
}

export interface ShipSpec {
  position: { x: number; y: number };
  direction: boolean;
  length: number;
  type: 'small'|'medium'|'large'|'huge';
}

export interface GamePlayer {
  idPlayer: string;
  playerIndex: string;
  ships?: ShipSpec[];
  shipCells?: Set<string>;
  killedShipsCount?: number;
}

export interface Game {
  idGame: string;
  players: Map<string, GamePlayer>;
  currentPlayerId?: string;
  finished?: boolean;
}