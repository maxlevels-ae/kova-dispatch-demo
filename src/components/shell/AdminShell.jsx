'use client';

import { LayoutDashboard, Route, Car, Users, DollarSign, Inbox, Settings,Package } from 'lucide-react';
import Providers from '@/components/providers';
import AppShell from '@/components/shell/AppShell';

const NAV = [
  { href: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/rides', label: 'Rides', icon: Route },
  { href: '/admin/deliveries', label: 'Deliveries', icon: Package },
  { href: '/admin/drivers', label: 'Drivers', icon: Car },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/pricing', label: 'Pricing', icon: DollarSign },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/content/hero', label: 'Hero Banners', icon: LayoutDashboard, sectionLabel:'Content Management' },
  { href: '/admin/content/landmarks', label: 'Explore & Landmarks', icon: Route },
  { href: '/admin/support', label: 'Support', icon: Inbox },
];

export default function AdminShell({ children }) {
  return (
    <Providers>
      <AppShell nav={NAV}>{children}</AppShell>
    </Providers>
  );
}
