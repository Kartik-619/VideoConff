'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError('');

      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError('Invalid email or password');
      } else {
        router.push('/');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#cfe9f1] to-[#b8dde8] px-4 relative">

      {/* SOFT GLOW (same as signup) */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.5),_transparent_60%)]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="
          relative z-10
          w-full max-w-md
          bg-white/60
          backdrop-blur-xl
          rounded-2xl
          p-8
          shadow-2xl
        "
      >
        {/* BRAND */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-extrabold tracking-widest text-slate-800">
            SPHINX
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Mythic Intelligence Platform
          </p>
        </div>

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
            className="
              w-full px-4 py-3
              rounded-lg
              bg-white/80
              focus:outline-none
              focus:ring-2 focus:ring-sky-300
            "
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="
              w-full px-4 py-3
              rounded-lg
              bg-white/80
              focus:outline-none
              focus:ring-2 focus:ring-sky-300
            "
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
          className="
            mt-6 w-full py-3
            rounded-full
            bg-gradient-to-r from-sky-500 to-cyan-400
            text-white font-semibold
            shadow-lg
            hover:shadow-xl
            transition
          "
        >
          {loading ? 'Logging in...' : 'Login'}
        </motion.button>

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
