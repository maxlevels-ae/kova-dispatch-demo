'use client';
import Providers from '@/components/providers';
import RiderShell from '@/components/rider/RiderShell';
import '@/components/rider/rider.css';
export default function RiderLayout({children}){return <Providers><RiderShell>{children}</RiderShell></Providers>;}
