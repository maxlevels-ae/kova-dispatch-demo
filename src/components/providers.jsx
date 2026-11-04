'use client';

import { SessionProvider } from 'next-auth/react';
import { SocketProvider } from '@/context/SocketProvider';
import { ToastProvider } from '@/components/ui/Toast';
import {NotificationProvider} from '@/context/NotificationProvider';

/** Client providers for the authenticated app surfaces. */
export default function Providers({ children }) {
  return (
    <SessionProvider>
      <SocketProvider>
        <ToastProvider><NotificationProvider>{children}</NotificationProvider></ToastProvider>
      </SocketProvider>
    </SessionProvider>
  );
}
