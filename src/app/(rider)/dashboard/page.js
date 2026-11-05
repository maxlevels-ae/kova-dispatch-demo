import {Suspense} from 'react';
import RiderExperience from '@/components/rider/RiderExperience';
export default function RiderDashboard(){return <Suspense fallback={<div role="status">Loading…</div>}><RiderExperience/></Suspense>;}
