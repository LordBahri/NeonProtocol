import { Schema, type, ArraySchema } from '@colyseus/schema';

export class SectorInfoSchema extends Schema {
  @type('string') id: string = '';
  @type('string') name: string = '';
  @type('uint32') playerCount: number = 0;
  @type('uint32') maxPlayers: number = 64;
}

export class LobbySchema extends Schema {
  @type([SectorInfoSchema]) sectors = new ArraySchema<SectorInfoSchema>();
  @type('uint32') totalPlayers: number = 0;
}
