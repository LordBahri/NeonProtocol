import { Schema, type, MapSchema } from '@colyseus/schema';
import { ShipSchema } from './ShipSchema';

export class SectorSchema extends Schema {
  @type({ map: ShipSchema }) ships = new MapSchema<ShipSchema>();
  @type('string') sectorId: string = '';
  @type('string') sectorName: string = '';
  @type('uint32') tick: number = 0;
  @type('uint32') playerCount: number = 0;
}
