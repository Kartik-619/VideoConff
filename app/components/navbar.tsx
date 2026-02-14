'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';

export default function Navbar() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const isLoggedIn = status === 'authenticated';
  const isHome = pathname === '/';

  // Nav item style helper
  const navItem = (path: string) =>
    `relative cursor-pointer px-1 py-1 transition-all duration-300 ${
      pathname === path
        ? isHome
          ? 'text-white font-semibold'
          : 'text-slate-900 font-semibold'
        : isHome
        ? 'text-white/80 hover:text-white'
        : 'text-slate-600 hover:text-slate-900'
    }`;

  return (
    <nav
      className={`
        fixed top-0 left-0 right-0 z-50
        flex items-center justify-between
        px-10 py-5
        backdrop-blur-md border-b
        transition-colors duration-300
        ${
          isHome
            ? 'bg-white/20 border-white/30'
            : 'bg-white/80 border-slate-200'
        }
      `}
    >
      {/* LOGO */}
      <h1
        onClick={() => router.push('/')}
        className={`cursor-pointer text-2xl font-extrabold tracking-widest ${
          isHome ? 'text-white' : 'text-slate-900'
        }`}
      >
        SPHINX
      </h1>

      {/* NAV LINKS */}
      <ul className="flex gap-8 text-sm font-medium">
        <li onClick={() => router.push('/')} className={navItem('/')}>
          Home
          {pathname === '/' && (
            <span
              className={`absolute left-0 -bottom-1 h-[2px] w-full rounded-full ${
                isHome ? 'bg-white/90' : 'bg-slate-900'
              }`}
            />
          )}
        </li>

        <li onClick={() => router.push('/about')} className={navItem('/about')}>
          About Us
          {pathname === '/about' && (
            <span className="absolute left-0 -bottom-1 h-[2px] w-full rounded-full bg-slate-900" />
          )}
        </li>

        {isLoggedIn && (
          <>
            <li
              onClick={() => router.push('/dashboard')}
              className={navItem('/dashboard')}
            >
              Dashboard
              {pathname === '/dashboard' && (
                <span className="absolute left-0 -bottom-1 h-[2px] w-full rounded-full bg-slate-900" />
              )}
            </li>

            <li
              onClick={() => router.push('/downloads')}
              className={navItem('/downloads')}
            >
              Downloads
            </li>

            <li
              onClick={() => router.push('/profile')}
              className={navItem('/profile')}
            >
              Profile
            </li>
          </>
        )}
      </ul>

      {/* AUTH BUTTON */}
      {!isLoggedIn ? (
        <div className="flex gap-3">
          <button
            onClick={() => signIn()}
            className="rounded-full px-6 py-2.5 bg-cyan-500 text-black font-semibold hover:bg-cyan-400 transition"
          >
            Login
          </button>

          <button
            onClick={() => router.push('/signup')}
            className={`rounded-full px-6 py-2.5 border-2 font-semibold transition ${
              isHome
                ? 'border-white text-white hover:bg-white/20'
                : 'border-slate-900 text-slate-900 hover:bg-slate-100'
            }`}
          >
            Sign Up
          </button>
        </div>
      ) : (
        <button
          onClick={() => signOut()}
          className="rounded-full px-6 py-2.5 bg-cyan-500 text-black font-semibold hover:bg-cyan-400 transition"
        >
          Logout
        </button>
      )}
    </nav>
  );
}
