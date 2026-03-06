'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';

export default function Navbar() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const isLoggedIn = status === 'authenticated';

  // Modern nav item style
  const navItem = (path: string) =>
  `relative cursor-pointer px-2 py-1 text-sm font-medium
   transition-all duration-300
   ${
     pathname === path
       ? 'text-slate-900 tracking-wide'
       : 'text-slate-700 hover:text-slate-900'
   }
   after:absolute after:left-0 after:-bottom-2
   after:h-[2px] after:rounded-full
   after:transition-all after:duration-300
   ${
     pathname === path
       ? 'after:w-full after:bg-gradient-to-r after:from-cyan-500 after:to-indigo-600 after:shadow-[0_0_8px_rgba(59,130,246,0.7)]'
       : 'after:w-0 hover:after:w-full after:bg-gradient-to-r after:from-cyan-500 after:to-indigo-600'
   }
  `;

  return (
    <nav
      className="
        fixed top-5 left-1/2 -translate-x-1/2
        w-[92%] max-w-7xl
        z-50
        flex items-center justify-between
        px-10 py-4
        rounded-2xl
        backdrop-blur-xl
        bg-white/30
        border border-white/40
        shadow-[0_8px_32px_rgba(0,0,0,0.15)]
        transition-all duration-300
      "
    >
      {/* LOGO */}
      <h1
        onClick={() => router.push('/')}
        className="
          cursor-pointer 
          text-2xl 
          font-extrabold 
          tracking-widest 
          bg-gradient-to-r 
          from-cyan-500 
          to-indigo-600 
          bg-clip-text 
          text-transparent
        "
      >
        SPHINX
      </h1>

      {/* NAV LINKS */}
      <ul className="flex gap-8">
        <li onClick={() => router.push('/')} className={navItem('/')}>
          Home
        </li>

        <li onClick={() => router.push('/about')} className={navItem('/about')}>
          About Us
        </li>

        {isLoggedIn && (
          <>
            <li
              onClick={() => router.push('/dashboard')}
              className={navItem('/dashboard')}
            >
              Dashboard
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
            className="
              rounded-full px-6 py-2.5
              bg-gradient-to-r from-cyan-500 to-indigo-600
              text-white font-semibold
              shadow-md
              hover:shadow-xl
              hover:-translate-y-0.5
              transition-all duration-300
            "
          >
            Login
          </button>

          <button
            onClick={() => router.push('/signup')}
            className="
              rounded-full px-6 py-2.5
              border border-white/40
              bg-white/20
              backdrop-blur-md
              text-slate-800 font-semibold
              hover:bg-white/30
              transition-all duration-300
            "
          >
            Sign Up
          </button>
        </div>
      ) : (
        <button
          onClick={() => signOut()}
          className="
            rounded-full px-6 py-2.5
            bg-gradient-to-r from-cyan-500 to-indigo-600
            text-white font-semibold
            shadow-md
            hover:shadow-xl
            hover:-translate-y-0.5
            transition-all duration-300
          "
        >
          Logout
        </button>
      )}
    </nav>
  );
}