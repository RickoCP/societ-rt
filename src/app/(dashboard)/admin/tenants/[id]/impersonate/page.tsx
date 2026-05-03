'use client';

import { useParams } from 'next/navigation';
import { ImpersonateScreen } from '@features/operational/screens/ImpersonateScreen';

export default function ImpersonatePage() {
  const params = useParams<{ id: string }>();

  return <ImpersonateScreen tenantId={params.id} />;
}
