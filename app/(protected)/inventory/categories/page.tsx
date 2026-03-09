import { MasterManagementPage } from '@/components/inventory/MasterManagementPage';

export default function InventoryCategoriesPage() {
  return <MasterManagementPage title="カテゴリ管理" endpoint="/api/inventory/categories" />;
}
