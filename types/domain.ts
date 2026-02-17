export type EntityId = string;

export interface SiteDto {
  id?: EntityId;
  siteId: string;
  name: string;
  lat: number;
  lon: number;
  polygonGeoJson?: string | null;
  client: string;
  active?: boolean;
}

export interface MachineDto {
  id?: EntityId;
  machineId: string;
  name: string;
  active?: boolean;
}

export interface WorkTypeDto {
  id?: EntityId;
  workId: string;
  name: string;
  sortOrder: number;
  active?: boolean;
}

export interface LogDto {
  id?: EntityId;
  timestamp: string;
  date: string;
  userIds: readonly string[];
  machineIds: readonly string[];
  lat?: number;
  lon?: number;
  accuracy?: number;
  siteName?: string;
  clientName?: string;
  work?: number;
  workDescription?: string;
  type: 'IN' | 'OUT';
}

export interface SessionDto {
  userKey: string;
  inTimestamp: string;
  outTimestamp: string;
  workDescription: string | null;
  siteName: string | null;
  machineId: string | null;
  machineName: string | null;
}
