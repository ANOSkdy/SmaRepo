import type { LogDto, MachineDto, SiteDto, WorkTypeDto } from './domain';

type FieldValue = string | number | boolean | readonly string[] | undefined;

// 各テーブルのフィールドの型定義
export interface UserFields {
  [key: string]: FieldValue;
  userId: string;
  name: string;
  username: string;
  role: 'admin' | 'user';
  active?: boolean;
  excludeBreakDeduction?: boolean | string | number;
}

export interface MachineFields {
  [key: string]: FieldValue;
  machineid: MachineDto['machineId'];
  name: MachineDto['name'];
  active?: MachineDto['active'];
}

export interface SiteFields {
  [key: string]: FieldValue;
  siteId: SiteDto['siteId'];
  name: SiteDto['name'];
  lat: SiteDto['lat'];
  lon: SiteDto['lon'];
  polygon_geojson?: string;
  client: SiteDto['client'];
  active?: SiteDto['active'];
}

export interface WorkTypeFields {
  [key: string]: FieldValue;
  workId: WorkTypeDto['workId'];
  name: WorkTypeDto['name'];
  sortOrder: WorkTypeDto['sortOrder'];
  active?: WorkTypeDto['active'];
}

export interface LogFields {
  [key: string]: FieldValue;
  timestamp: LogDto['timestamp']; // ISO 8601 string
  date: LogDto['date']; // YYYY-MM-DD
  user: LogDto['userIds']; // Link to Users table (record IDs)
  machine: LogDto['machineIds']; // Link to Machines table (record IDs)
  lat?: LogDto['lat'];
  lon?: LogDto['lon'];
  accuracy?: LogDto['accuracy'];
  siteName?: LogDto['siteName'];
  clientName?: LogDto['clientName'];
  work?: LogDto['work'];
  workDescription?: LogDto['workDescription'];
  type: LogDto['type'];
}

export type StampPayload = {
  siteId: string;
  lat: number;
  lon: number;
  accuracy?: number;
  positionTimestamp?: number;
  clientDecision?: 'auto' | 'blocked';
};

export type StampRecord = {
  id: string;
  siteId: string;
  lat: number;
  lon: number;
  accuracy?: number;
  createdAt: string;
};

export type DomainDtos = {
  site: SiteDto;
  machine: MachineDto;
  workType: WorkTypeDto;
  log: LogDto;
};

export type { SiteDto, MachineDto, WorkTypeDto, LogDto, SessionDto } from './domain';
