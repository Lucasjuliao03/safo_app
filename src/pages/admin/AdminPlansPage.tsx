import { AdminLayout } from "@/components/AdminLayout";
import AdminPlans from "./AdminPlans";

export default function AdminPlansPage() {
  return (
    <AdminLayout>
      <div className="p-6">
         <AdminPlans />
      </div>
    </AdminLayout>
  );
}
