import { MasterManagementPage } from '@/components/inventory/MasterManagementPage';

export default function InventoryLocationsPage() {
  return <MasterManagementPage title="保管場所管理" endpoint="/api/inventory/locations" />;
}
