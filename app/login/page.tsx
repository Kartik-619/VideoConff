'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');

  const { status } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ✅ Prevent login loop after Google login
  useEffect(() => {
    if (status === "authenticated") {
      if (redirect === "join") {
        router.push("/join");
      } else {
        router.push("/");
      }
    }
  }, [status, redirect, router]);

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError('');

      const res = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (res?.error) {

        // Handle Google account login attempt
        if (res.error === "GOOGLE_ACCOUNT") {
          setError("This account was created with Google. Please continue with Google login.");
        }

        else if (res.error === "DATABASE_UNAVAILABLE") {
          setError("Server is waking up. Please try again in a few seconds.");
        }

        else {
          setError("Invalid email or password");
        }

      } else {

        // Redirect after login
        if (redirect === 'join') {
          router.push('/join');
        } else {
          router.push('/');
        }

      }

    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#cfe9f1] to-[#b8dde8] px-4 relative">

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.5),_transparent_60%)]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md bg-white/60 backdrop-blur-xl rounded-2xl p-8 shadow-2xl"
      >

        <h2 className="text-2xl font-bold text-center text-slate-900">
          Welcome Back
        </h2>

        <p className="mt-2 text-center text-sm text-slate-600">
          Login to continue your intelligent meetings
        </p>

        <div className="mt-6 space-y-4">

          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-white/80 focus:outline-none focus:ring-2 focus:ring-sky-300"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg bg-white/80 focus:outline-none focus:ring-2 focus:ring-sky-300"
          />

        </div>

        {error && (
          <p className="mt-3 text-center text-sm text-red-600">
            {error}
          </p>
        )}

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleLogin}
          disabled={loading}
          className="mt-6 w-full py-3 rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 text-white font-semibold shadow-lg hover:shadow-xl transition"
        >
          {loading ? 'Logging in...' : 'Login'}
        </motion.button>

        {/* Divider */}

        <div className="mt-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-slate-300" />
          <span className="text-xs text-slate-500">OR</span>
          <div className="h-px flex-1 bg-slate-300" />
        </div>

        {/* Google Login */}

        <button
          onClick={() =>
            signIn("google", {
              callbackUrl: redirect === "join" ? "/join" : "/"
            })
          }
          className="mt-6 w-full py-3 flex items-center justify-center gap-3 rounded-full bg-white text-slate-800 font-semibold shadow hover:bg-slate-100 transition"
        >

          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            width="20"
            height="20"
          >
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.73 1.22 9.23 3.6l6.86-6.86C35.98 2.56 30.4 0 24 0 14.62 0 6.51 5.48 2.56 13.44l7.98 6.19C12.38 13.16 17.77 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.56-.14-3.05-.4-4.5H24v8.5h12.7c-.55 2.96-2.23 5.47-4.75 7.16l7.36 5.73C43.9 37.25 46.5 31.4 46.5 24.5z"/>
            <path fill="#FBBC05" d="M10.54 28.63A14.4 14.4 0 0 1 9.5 24c0-1.61.28-3.17.78-4.63l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.77.9 7.33 2.5 10.44l8.04-5.81z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.92-2.14 15.89-5.81l-7.36-5.73c-2.05 1.38-4.68 2.19-8.53 2.19-6.23 0-11.52-4.21-13.42-9.87l-8.04 5.81C6.5 42.52 14.62 48 24 48z"/>
          </svg>

          Continue with Google

        </button>

        <p className="mt-4 text-center text-sm text-slate-600">
          Don’t have an account?{' '}
          <span
            onClick={() => router.push('/signup')}
            className="cursor-pointer font-medium text-sky-600 hover:underline"
          >
            Create one
          </span>
        </p>

      </motion.div>
    </div>
  );
}