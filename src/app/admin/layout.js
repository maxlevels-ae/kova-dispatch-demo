import { auth } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import { dashboardForRole } from '@/lib/auth/redirects';
import AdminShell from '@/components/shell/AdminShell';
export default async function AdminLayout({ children }) {
  const session = await auth();
  if (!session?.user) redirect('/login?callbackUrl=/admin/dashboard');
  if (session.user.role !== 'admin') redirect(dashboardForRole(session.user.role));
  return <AdminShell>{children}</AdminShell>;
}
