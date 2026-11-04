'use client';

import { Gauge, DollarSign, Clock, UserRound, Wallet,Package } from 'lucide-react';
import DriverDelivery from '@/components/delivery/DriverDelivery';
import Providers from '@/components/providers';
import AppShell from '@/components/shell/AppShell';

const NAV = [
  { href: '/driver/dashboard', label: 'Drive', icon: Gauge },
  { href: '/driver/earnings', label: 'Earnings', icon: DollarSign },
  { href: '/driver/wallet', label: 'Wallet', icon: Wallet },
  { href: '/driver/trips', label: 'Trips', icon: Clock },
  { href: '/driver/deliveries', label: 'Deliveries', icon: Package },
  { href: '/driver/profile', label: 'Profile', icon: UserRound },
];

export default function DriverLayout({ children }) {
  return (
    <Providers>
      <AppShell nav={NAV}><DriverDelivery/>{children}</AppShell>
    </Providers>
  );
}
