'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

interface SignupForm {
  name: string;
  email: string;
  password: string;
}

export default function SignupPage() {
  const router = useRouter();

  const [form, setForm] = useState<SignupForm>({
    name: '',
    email: '',
    password: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const passwordRules = {
    length: form.password.length >= 8,
    uppercase: /[A-Z]/.test(form.password),
    lowercase: /[a-z]/.test(form.password),
    number: /\d/.test(form.password),
    special: /[@$!%*?&]/.test(form.password),
  };

  const isStrongPassword =
    passwordRules.length &&
    passwordRules.uppercase &&
    passwordRules.lowercase &&
    passwordRules.number &&
    passwordRules.special;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSignup = async () => {
    setError('');

    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Enter a valid email address');
      return;
    }

    if (!isStrongPassword) {
      setError('Password does not meet security requirements');
      return;
    }

    try {
      setLoading(true);
      await axios.post('/api/signup', form);
      router.push('/login');
    } catch (err) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { data?: string } };
        setError(axiosError.response?.data || 'Signup failed');
      } else {
        setError('Signup failed');
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
          Create Account
        </h2>

        <p className="mt-4 text-center text-sm text-slate-600">
          Sign up instantly with Google
        </p>

      {/* Google Signup */}
      <button
        onClick={() => signIn("google", { callbackUrl: "/" })}
        className="
          mt-6 w-full py-3
          flex items-center justify-center gap-3
          rounded-full
          bg-white
          text-slate-800
          font-semibold
          shadow
          hover:bg-slate-100
          transition
        "
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

      {/* Divider */}
      <div className="mt-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-slate-300" />
        <span className="text-xs text-slate-500">OR</span>
        <div className="h-px flex-1 bg-slate-300" />
      </div>

        <div className="mt-6 space-y-4">
          <input
            name="name"
            placeholder="Full Name"
            value={form.name}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg bg-white/80 focus:outline-none focus:ring-2 focus:ring-sky-300"
          />

          <input
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg bg-white/80 focus:outline-none focus:ring-2 focus:ring-sky-300"
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Password"
              value={form.password}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-lg bg-white/80 focus:outline-none focus:ring-2 focus:ring-sky-300 pr-12"
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-600 hover:text-slate-900"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          {/* Password Rules */}
          {form.password && (
            <div className="mt-3 space-y-2 text-xs">
              <PasswordRule valid={passwordRules.length} text="At least 8 characters" />
              <PasswordRule valid={passwordRules.uppercase} text="One uppercase letter" />
              <PasswordRule valid={passwordRules.lowercase} text="One lowercase letter" />
              <PasswordRule valid={passwordRules.number} text="One number" />
              <PasswordRule valid={passwordRules.special} text="One special character (@$!%*?&)" />

              <div className="pt-2">
                <PasswordStrength password={form.password} />
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 text-center text-sm text-red-600">
            {error}
          </p>
        )}

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleSignup}
          disabled={loading}
          className="mt-6 w-full py-3 rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 text-white font-semibold shadow-lg hover:shadow-xl transition"
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </motion.button>

      </motion.div>

    </div>
  );
}

/* ---------- Helper Components (OUTSIDE MAIN COMPONENT) ---------- */

function PasswordRule({ valid, text }: { valid: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-2 transition-colors duration-300 ${valid ? "text-green-600" : "text-slate-500"}`}>
      <span>{valid ? "✔" : "✖"}</span>
      <span>{text}</span>
    </div>
  );
}

function PasswordStrength({ password }: { password: string }) {
  let strength = 0;

  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[@$!%*?&]/.test(password)) strength++;

  let label = "Weak";
  let color = "bg-red-500";

  if (strength >= 4) {
    label = "Strong";
    color = "bg-green-500";
  } else if (strength >= 3) {
    label = "Medium";
    color = "bg-yellow-500";
  }

  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600 mb-1">
        <span>Password strength</span>
        <span>{label}</span>
      </div>
      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${(strength / 5) * 100}%` }}
        />
      </div>
    </div>
  );
}