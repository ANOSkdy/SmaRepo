export type MasterSite = {
  id: string;
  name: string | null;
  clientName: string | null;
  active: boolean;
  radiusM: number | null;
  priority: number | null;
  longitude: number | null;
  latitude: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type MasterUser = {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: 'admin' | 'user';
  active: boolean;
  excludeBreakDeduction: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type MasterWorkType = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  category: 'operating' | 'regular' | 'other';
  createdAt: string | null;
  updatedAt: string | null;
};

export type MasterMachine = {
  id: string;
  machineCode: string;
  name: string;
  active: boolean;
  rate: number | null;
  rateUnit: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};
