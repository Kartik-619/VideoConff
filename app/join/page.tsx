'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinMeetingPage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const extractMeetingIdFromUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/');
      return parts[parts.length - 1];
    } catch {
      return null;
    }
  };

  const handleJoin = async () => {
    if (!input.trim()) {
      setError('Meeting code or invite link is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const trimmed = input.trim();

      // 🔹 If full invite link
      if (trimmed.startsWith('http')) {
        const meetingId = extractMeetingIdFromUrl(trimmed);

        if (!meetingId) {
          throw new Error('Invalid invite link');
        }

        router.push(`/meeting/${meetingId}`);
        return;
      }

      // 🔹 If looks like UUID (basic check)
      if (trimmed.includes('-') && trimmed.length > 20) {
        router.push(`/meeting/${trimmed}`);
        return;
      }

      // 🔹 Otherwise treat as meeting code
      const res = await fetch('/api/meeting/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingCode: trimmed.toUpperCase() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to join meeting');
      }

      const data = await res.json();
      router.push(`/meeting/${data.meetingId}`);

     } catch (err) {
       setError(err instanceof Error ? err.message : 'An error occurred');
     } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-32 pb-20">

      <div className="
        w-full max-w-md
        bg-slate-900/40
        backdrop-blur-xl
        border border-slate-800
        rounded-3xl
        shadow-2xl
        p-10
      ">

        <h1 className="text-3xl font-bold text-center text-white">
          Join a Meeting
        </h1>

        <p className="mt-3 text-center text-slate-400">
          Paste a meeting code or invite link
        </p>

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ABC123 or https://..."
          className="
            mt-8 w-full px-4 py-3
            rounded-xl
            bg-slate-800
            border border-slate-700
            text-white text-center
            tracking-wide
            placeholder-slate-500
            focus:outline-none
            focus:ring-2 focus:ring-cyan-500
          "
        />

        {error && (
          <p className="mt-4 text-center text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          onClick={handleJoin}
          disabled={loading}
          className="
            mt-8 w-full py-3 rounded-xl
            bg-gradient-to-r from-cyan-500 to-indigo-600
            text-white font-semibold
            hover:opacity-90
            transition-all duration-200
            disabled:opacity-50
          "
        >
          {loading ? 'Joining…' : 'Join Meeting'}
        </button>

      </div>

    </div>
  );
}