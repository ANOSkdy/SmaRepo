import { getCurrentUserRole, isRoleUser } from '@/lib/permissions';
import AppHeader from './AppHeader';

export const dynamic = 'force-dynamic';

export default async function NavTabsServer() {
  const role = await getCurrentUserRole();
  const isAdmin = role === 'admin';
  return <AppHeader showNfc={!isRoleUser(role)} showMaster={isAdmin} />;
}
