export type MasterSite = {
  id: string;
  siteCode: string | null;
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
  userCode: string | null;
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
  workCode: string | null;
  name: string;
  sortOrder: number;
  active: boolean;
  category: 'operating' | 'regular' | 'other';
  createdAt: string | null;
  updatedAt: string | null;
};
