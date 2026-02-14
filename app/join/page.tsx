'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinMeetingPage() {
  const router = useRouter();
  const [meetingCode, setMeetingCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    if (!meetingCode.trim()) {
      setError('Meeting code is required');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const res = await fetch('/api/meeting/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ meetingCode }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to join meeting');
      }

      const data = await res.json();

      router.push(`/meeting/${data.meetingId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">

        <h1 className="text-2xl font-bold text-center text-slate-800">
          Join a Meeting
        </h1>

        <p className="mt-2 text-center text-slate-600">
          Enter the meeting code shared by the host
        </p>

        <input
          value={meetingCode}
          onChange={(e) => setMeetingCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          className="mt-6 w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400 text-center tracking-widest font-mono"
        />

        {error && (
          <p className="mt-3 text-center text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          onClick={handleJoin}
          disabled={loading}
          className="mt-6 w-full py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
        >
          {loading ? 'Joining…' : 'Join Meeting'}
        </button>

      </div>
    </div>
  );
}
