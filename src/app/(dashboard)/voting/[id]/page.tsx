'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@components/atoms/Button';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import Link from 'next/link';

interface VoteOption {
  id: string;
  label: string;
}

interface VoteDetail {
  id: string;
  title: string;
  description: string;
  mode: string;
  deadline: string;
  options: VoteOption[];
  createdAt: string;
}

interface TallyOption {
  optionId: string;
  label: string;
  voteCount: number;
}

interface Voter {
  optionId: string;
  userName: string;
  votedAt: string;
}

interface TallyData {
  totalVotes: number;
  mode?: string;
  options: TallyOption[];
  voters?: Voter[];
}

interface MyVoteData {
  hasVoted: boolean;
  optionId: string | null;
  votedAt: string | null;
}

export default function VoteDetailPage() {
  const params = useParams();
  const voteId = params.id as string;

  const [vote, setVote] = useState<VoteDetail | null>(null);
  const [tally, setTally] = useState<TallyData | null>(null);
  const [myVote, setMyVote] = useState<MyVoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Voting state
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteSuccess, setVoteSuccess] = useState(false);
  const [isChangingVote, setIsChangingVote] = useState(false);

  const isActive = vote ? new Date(vote.deadline) > new Date() : false;

  useEffect(() => {
    let isMounted = true;

    async function fetchVote() {
      try {
        // Fetch vote detail with options
        const detailRes = await fetch(`/api/voting/${voteId}`);
        const detailJson = await detailRes.json();
        if (!isMounted) return;
        if (!detailRes.ok) {
          setError(detailJson.message ?? 'Vote not found');
          setLoading(false);
          return;
        }
        setVote(detailJson.data);

        // Fetch tally
        const tallyRes = await fetch(`/api/voting/${voteId}/tally`);
        const tallyJson = await tallyRes.json();
        if (!isMounted) return;
        if (tallyRes.ok) {
          setTally(tallyJson.data ?? tallyJson);
        }

        // Fetch user's current vote
        const myVoteRes = await fetch(`/api/voting/${voteId}/my-vote`);
        const myVoteJson = await myVoteRes.json();
        if (!isMounted) return;
        if (myVoteRes.ok) {
          setMyVote(myVoteJson.data);
          // Pre-select user's current vote if they have one
          if (myVoteJson.data?.hasVoted && myVoteJson.data?.optionId) {
            setSelectedOption(myVoteJson.data.optionId);
          }
        }
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchVote();

    return () => {
      isMounted = false;
    };
  }, [voteId]);

  const handleVote = async () => {
    if (!selectedOption) {
      setVoteError('Pilih salah satu opsi');
      return;
    }
    setVoting(true);
    setVoteError(null);
    setVoteSuccess(false);
    try {
      const res = await fetch(`/api/voting/${voteId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId: selectedOption }),
      });
      const json = await res.json();
      if (!res.ok) {
        setVoteError(json.message ?? json.code ?? 'Gagal melakukan voting');
        return;
      }
      setVoteSuccess(true);
      setIsChangingVote(false);
      // Update myVote state
      setMyVote({
        hasVoted: true,
        optionId: selectedOption,
        votedAt: new Date().toISOString(),
      });
      // Refresh tally
      const tallyRes = await fetch(`/api/voting/${voteId}/tally`);
      const tallyJson = await tallyRes.json();
      if (tallyRes.ok) setTally(tallyJson.data ?? tallyJson);
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setVoting(false);
    }
  };

  const handleChangeVote = () => {
    setIsChangingVote(true);
    setVoteSuccess(false);
  };

  const handleCancelChange = () => {
    setIsChangingVote(false);
    // Reset to current vote
    if (myVote?.optionId) {
      setSelectedOption(myVote.optionId);
    }
  };

  // Helper to get option label by ID
  const getOptionLabel = (optionId: string | null): string => {
    if (!optionId || !vote) return '-';
    const option = vote.options.find(o => o.id === optionId);
    return option?.label ?? '-';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error) return <ErrorMessage message={error} />;
  if (!vote) return <ErrorMessage message="Vote not found" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{vote.title}</h1>
        <Link href="/voting" className="text-sm text-blue-600 hover:underline dark:text-blue-400">← Back</Link>
      </div>

      {/* Vote Info */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">{vote.description}</p>
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
          <Badge variant={isActive ? 'success' : 'default'}>{isActive ? 'Active' : 'Closed'}</Badge>
          <Badge variant="info">{vote.mode}</Badge>
          <span>Deadline: {new Date(vote.deadline).toLocaleString()}</span>
        </div>
      </div>

      {/* Cast Vote */}
      {isActive && (!myVote?.hasVoted || isChangingVote) && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isChangingVote ? 'Ubah Pilihan Anda' : 'Berikan Suara Anda'}
          </h2>
          <div className="flex flex-col gap-2">
            {(vote.options ?? []).map(opt => (
              <label key={opt.id} className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors ${selectedOption === opt.id ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20' : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'}`}>
                <input
                  type="radio"
                  name="vote-option"
                  value={opt.id}
                  checked={selectedOption === opt.id}
                  onChange={() => setSelectedOption(opt.id)}
                  className="h-4 w-4 text-blue-600"
                />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{opt.label}</span>
                {isChangingVote && myVote?.optionId === opt.id && (
                  <Badge variant="info" className="ml-auto">Pilihan saat ini</Badge>
                )}
              </label>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleVote} disabled={voting || !selectedOption || (isChangingVote && selectedOption === myVote?.optionId)} variant="primary">
              {voting ? 'Menyimpan...' : isChangingVote ? 'Simpan Perubahan' : 'Kirim Suara'}
            </Button>
            {isChangingVote && (
              <Button onClick={handleCancelChange} variant="secondary">
                Batal
              </Button>
            )}
          </div>
          {voteError && <div className="mt-3"><ErrorMessage message={voteError} /></div>}
        </div>
      )}

      {/* Current Vote Status */}
      {myVote?.hasVoted && !isChangingVote && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                {voteSuccess ? 'Pilihan Anda telah disimpan!' : 'Suara Anda telah tercatat!'}
              </p>
              <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                Pilihan Anda: <span className="font-semibold">{getOptionLabel(myVote.optionId)}</span>
              </p>
              {myVote.votedAt && (
                <p className="mt-0.5 text-xs text-green-600 dark:text-green-500">
                  Waktu: {new Date(myVote.votedAt).toLocaleString('id-ID')}
                </p>
              )}
            </div>
            {isActive && (
              <Button onClick={handleChangeVote} variant="secondary" className="ml-4">
                Ubah Pilihan
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Vote Closed Message */}
      {!isActive && !myVote?.hasVoted && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Voting ini sudah ditutup. Anda tidak dapat memberikan suara.
          </p>
        </div>
      )}

      {/* Tally Results */}
      {tally && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Results ({tally.totalVotes} vote{tally.totalVotes !== 1 ? 's' : ''})
          </h2>
          <div className="flex flex-col gap-3">
            {(tally.options ?? []).map(opt => {
              const percentage = tally.totalVotes > 0 ? (opt.voteCount / tally.totalVotes) * 100 : 0;
              return (
                <div key={opt.optionId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{opt.label}</span>
                    <span className="text-gray-500 dark:text-gray-400">{opt.voteCount} ({percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Voter Details (verified mode + admin only) */}
          {tally.voters && tally.voters.length > 0 && (
            <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-700">
              <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Voter Details (Verified Mode)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
                    <tr>
                      <th className="px-3 py-2">Nama</th>
                      <th className="px-3 py-2">Pilihan</th>
                      <th className="px-3 py-2">Waktu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tally.voters.map((v, i) => {
                      const optLabel = (tally.options ?? []).find(o => o.optionId === v.optionId)?.label ?? '-';
                      return (
                        <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{v.userName}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{optLabel}</td>
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-500">{new Date(v.votedAt).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
