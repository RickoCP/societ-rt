'use client';

import { useParams } from 'next/navigation';
import { MonitoringWindowScreen } from '@features/doorMonitoring/screens/MonitoringWindowScreen';

export default function MonitoringWindowPage() {
  const params = useParams();
  const householdId = params.householdId as string;
  return <MonitoringWindowScreen householdId={householdId} />;
}
