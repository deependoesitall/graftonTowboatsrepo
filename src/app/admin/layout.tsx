// src/app/admin/layout.tsx
import { AdminNav } from '@/components/admin/AdminNav';

export const metadata = {
  title: 'Admin Dashboard — Grafton Towboat',
  robots: 'noindex',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AdminNav />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
