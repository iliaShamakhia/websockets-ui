import type { Game, PlayerRecord, Room } from "./types";

export const players = new Map<string, PlayerRecord>();

export const playersByIndex = new Map<string, PlayerRecord>();

export const rooms = new Map<string, Room>();

export const games = new Map<string, Game>();