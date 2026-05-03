'use client';

import { useParams } from 'next/navigation';
import { LetterDetailScreen } from '@features/administration/screens/LetterDetailScreen';

export default function LetterDetailPage() {
  const params = useParams<{ id: string }>();

  return <LetterDetailScreen id={params.id} />;
}
