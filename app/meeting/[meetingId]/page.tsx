'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Button from '../../components/ui/Button';
import { Copy, Link2, Users, Play, LogOut, Share2 } from 'lucide-react';
import toast from "react-hot-toast";

type MeetingData = {
  id: string;
  meetingCode: string;
  status: string;
  host: { id: string; name: string } | null;
  participants: { id: string; name: string }[];
  waitingUsers: { id: string; name: string }[];
};

export default function MeetingLobby() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();

  const meetingIdRef = useRef((params.meetingId as string) ?? '');
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [starting, setStarting] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const joinSentRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teardownRef = useRef(false);
  const connectingRef = useRef(false);

  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/meeting/${meetingIdRef.current}`
      : "";

  const closeWS = () => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  useEffect(() => {
    const meetingId = meetingIdRef.current;
    if (!meetingId || !session?.user?.id) return;

    teardownRef.current = false;

    const fetchMeeting = async () => {
      if (teardownRef.current) return;
      try {
        const res = await fetch(`/api/meeting/${meetingId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (teardownRef.current) return;
        setMeeting(data);
        setLoading(false);
        if (data.status === "LIVE") router.replace(`/meeting/${meetingId}/room`);
        if (data.status === "ENDED") {
          toast.error("Meeting has ended");
          router.replace("/");
        }
      } catch { /* ignore */ }
    };

    const connectWS = () => {
      if (wsRef.current) return;
      if (connectingRef.current) return;
      if (teardownRef.current) return;
      connectingRef.current = true;

      fetch("/api/ws-token")
        .then(r => r.json())
        .then(({ token }: { token: string }) => {
          if (!token || teardownRef.current) {
            connectingRef.current = false;
            return;
          }

          const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
          const ws = new WebSocket(
            `${backendUrl.replace(/^https/, 'wss').replace(/^http/, 'ws')}?token=${token}`
          );
          wsRef.current = ws;
          joinSentRef.current = false;
          connectingRef.current = false;

          ws.onopen = () => {
            if (joinSentRef.current) return;
            joinSentRef.current = true;
            ws.send(JSON.stringify({ type: "join", roomId: meetingId }));
          };

          ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.type === "meetingStarted") {
              teardownRef.current = true;
              closeWS();
              setTimeout(() => router.replace(`/meeting/${meetingId}/room`), 300);
            }
            if (msg.type === "lobbyUpdate") {
              setMeeting(prev => prev ? { ...prev, participants: msg.participants } : prev);
            }
            if (msg.type === "meetingEnded") {
              toast.error("Meeting ended by host");
              teardownRef.current = true;
              closeWS();
              router.replace("/");
            }
          };

          ws.onclose = () => {
            wsRef.current = null;
            if (teardownRef.current) return;
            if (!navigator.onLine) return;
            reconnectTimerRef.current = setTimeout(connectWS, 2000);
          };

          ws.onerror = () => ws.close();
        })
        .catch(() => {
          connectingRef.current = false;
        });
    };

    fetchMeeting();
    connectWS();

    pollTimerRef.current = setInterval(fetchMeeting, 10000);

    return () => {
      teardownRef.current = true;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      closeWS();
    };
  }, []);

  const handleCopyCode = async () => {
    if (!meeting) return;
    await navigator.clipboard.writeText(meeting.meetingCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "Join my meeting",
        text: "Click to join the meeting",
        url: inviteLink,
      });
    }
  };

  const handleStartMeeting = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await fetch('/api/meeting/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: meetingIdRef.current }),
      });
    } catch {
      setStarting(false);
    }
  };

  const handleLeave = async () => {
    teardownRef.current = true;
    closeWS();
    await fetch('/api/meeting/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId: meetingIdRef.current }),
    });
    router.replace('/');
  };

  const handleEnd = async () => {
    if (!isHost) return;
    teardownRef.current = true;
    closeWS();
    await fetch('/api/meeting/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId: meetingIdRef.current }),
    });
    router.replace('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100">
        <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-xl space-y-5 animate-pulse">
          <div className="h-6 w-1/2 mx-auto rounded bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300"></div>
          <div className="h-4 w-3/4 mx-auto rounded bg-gray-200"></div>
          <div className="space-y-3 mt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-300"></div>
                  <div className="h-4 w-24 rounded bg-gray-300"></div>
                </div>
                <div className="h-4 w-10 rounded bg-gray-300"></div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <div className="h-10 flex-1 rounded-xl bg-gray-300"></div>
            <div className="h-10 flex-1 rounded-xl bg-gray-200"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white gap-4">
        <h1 className="text-2xl font-semibold">Meeting not found</h1>
        <Button variant="primary" onClick={() => router.replace("/")}>
          Go Home
        </Button>
      </div>
    );
  }

  const isHost =
    session?.user?.id &&
    meeting?.host?.id &&
    session.user.id === meeting.host.id;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl 
        bg-gradient-to-br from-white to-blue-50/80
        backdrop-blur-md 
        border border-gray-200
        rounded-3xl 
        shadow-[0_20px_60px_rgba(0,0,0,0.25)]
        p-10">

        <h1 className="text-3xl font-bold text-gray-900 text-center tracking-tight">
          Meeting Lobby
        </h1>

        <p className="text-center text-sm text-gray-500 mt-2">
          {isHost
            ? "You are the host. Start the meeting when ready."
            : "Waiting for host to start the meeting..."}
        </p>

        <div className="mt-8 text-center">
          <p className="text-gray-500 text-xs uppercase tracking-widest">
            Meeting Code
          </p>
          <div className="mt-3 py-4 bg-white rounded-xl border border-gray-200 shadow-sm text-gray-900 text-2xl font-mono tracking-widest">
            {meeting.meetingCode}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <Button variant="secondary" onClick={handleCopyCode} full>
            <div className="flex items-center justify-center gap-2">
              <Copy size={16} />
              {copiedCode ? "Copied ✓" : "Copy Code"}
            </div>
          </Button>

          <Button
            variant="secondary"
            className="bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 shadow-sm hover:shadow-md transition"
            onClick={handleCopyLink}
            full
          >
            <div className="flex items-center justify-center gap-2">
              <Link2 size={16} />
              {copiedLink ? "Link Copied ✓" : "Copy Invite Link"}
            </div>
          </Button>
        </div>

        <div className="mt-3">
          <Button
            variant="secondary"
            className="bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 shadow-sm hover:shadow-md transition"
            onClick={handleShare}
            full
          >
            <div className="flex items-center justify-center gap-2">
              <Share2 size={16} />
              Share Invite
            </div>
          </Button>
        </div>

        <div className="mt-10">
          <h2 className="text-gray-900 font-semibold mb-3 flex items-center gap-2">
            <Users size={18} />
            Participants ({meeting.participants.length})
          </h2>

          <div className="space-y-2">
            {meeting.participants.map((user) => (
              <div
                key={user.id}
                className="p-3 rounded-xl bg-white border border-gray-200 shadow-sm text-gray-800 flex justify-between items-center"
              >
                <div className="flex items-center gap-2">
                  {user.name}
                  {meeting.host?.id === user.id && (
                    <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md">
                      Host 👑
                    </span>
                  )}
                  {session?.user?.id === user.id && (
                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                      You
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 space-y-4">
          {isHost && meeting.status !== "LIVE" && (
            <Button variant="primary" onClick={handleStartMeeting} disabled={starting} full>
              <div className="flex items-center justify-center gap-2">
                <Play size={16} />
                {starting ? "Starting..." : "Start Meeting"}
              </div>
            </Button>
          )}

          <div className="flex gap-4">
            <Button variant="destructive" onClick={handleLeave} full>
              <div className="flex items-center justify-center gap-2">
                <LogOut size={16} />
                Leave
              </div>
            </Button>

            {isHost && (
              <Button
                variant="destructive"
                className="bg-red-600 hover:bg-red-700 shadow-sm hover:shadow-md transition"
                onClick={handleEnd}
                full
              >
                End
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
