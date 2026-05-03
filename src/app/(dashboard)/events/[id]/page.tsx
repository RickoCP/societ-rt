'use client';

import { useParams } from 'next/navigation';
import { EventDetailScreen } from '@features/events/screens/EventDetailScreen';

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();

  return <EventDetailScreen id={params.id} />;
}
