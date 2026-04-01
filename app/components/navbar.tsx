'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';

export default function Navbar() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isLoggedIn = status === 'authenticated';

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
         ? 'after:w-full after:bg-gradient-to-r after:from-cyan-500 after:to-indigo-600'
         : 'after:w-0 hover:after:w-full after:bg-gradient-to-r after:from-cyan-500 after:to-indigo-600'
     }
    `;

  return (
    <nav className="fixed top-5 left-1/2 -translate-x-1/2 w-[92%] max-w-7xl z-50 flex items-center justify-between px-4 sm:px-6 md:px-10 py-3 md:py-4 rounded-2xl backdrop-blur-xl bg-white/30 border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.15)]">

      {/* LOGO */}
      <h1
        onClick={() => router.push('/')}
        className="cursor-pointer text-xl sm:text-2xl font-extrabold tracking-widest bg-white bg-clip-text text-transparent"
      >
        SPHINX
      </h1>

      {/* ✅ MOBILE: Only Login/Signup BEFORE login */}
      {!isLoggedIn && (
        <div className="md:hidden">
          {pathname === '/signup' ? (
            <button
              onClick={() => signIn()}
              className="rounded-full px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-sm font-semibold"
            >
              Login
            </button>
          ) : (
            <button
              onClick={() => router.push('/signup')}
              className="rounded-full px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-sm font-semibold"
            >
              Sign Up
            </button>
          )}
        </div>
      )}

      {/* ✅ MOBILE: Hamburger AFTER login */}
      {isLoggedIn && (
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="md:hidden flex flex-col gap-1.5 p-2"
        >
          <span className={`w-6 h-0.5 bg-slate-700 transition ${isMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></span>
          <span className={`w-6 h-0.5 bg-slate-700 transition ${isMenuOpen ? 'opacity-0' : ''}`}></span>
          <span className={`w-6 h-0.5 bg-slate-700 transition ${isMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}></span>
        </button>
      )}

      {/* DESKTOP NAV */}
      <ul className="hidden md:flex gap-4 lg:gap-8">
        <li onClick={() => router.push('/')} className={navItem('/')}>Home</li>
        <li onClick={() => router.push('/about')} className={navItem('/about')}>About Us</li>

        {isLoggedIn && (
          <>
            <li onClick={() => router.push('/dashboard')} className={navItem('/dashboard')}>Dashboard</li>
            <li onClick={() => router.push('/downloads')} className={navItem('/downloads')}>Downloads</li>
            <li onClick={() => router.push('/profile')} className={navItem('/profile')}>Profile</li>
          </>
        )}
      </ul>

      {/* DESKTOP AUTH */}
      <div className="hidden md:block">
        {!isLoggedIn ? (
          <div className="flex gap-2">
            <button
              onClick={() => signIn()}
              className="rounded-full px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 text-white"
            >
              Login
            </button>
            <button
              onClick={() => router.push('/signup')}
              className="rounded-full px-4 py-2 border border-gray-300"
            >
              Sign Up
            </button>
          </div>
        ) : (
          <button
            onClick={() => signOut()}
            className="rounded-full px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 text-white"
          >
            Logout
          </button>
        )}
      </div>

      {/* ✅ MOBILE DROPDOWN (SOLID + CLEAN) */}
      {isLoggedIn && (
        <div className={`absolute top-full left-0 right-0 mt-2 md:hidden transition-all duration-300 ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
          
          <div className="mx-4 p-4 rounded-2xl bg-white border border-gray-200 shadow-lg">

            <ul className="flex flex-col gap-2 mb-4">
              <li onClick={() => { router.push('/'); setIsMenuOpen(false); }} className="py-2 px-3 rounded-lg hover:bg-gray-100 cursor-pointer">Home</li>
              <li onClick={() => { router.push('/about'); setIsMenuOpen(false); }} className="py-2 px-3 rounded-lg hover:bg-gray-100 cursor-pointer">About Us</li>
              <li onClick={() => { router.push('/dashboard'); setIsMenuOpen(false); }} className="py-2 px-3 rounded-lg hover:bg-gray-100 cursor-pointer">Dashboard</li>
              <li onClick={() => { router.push('/downloads'); setIsMenuOpen(false); }} className="py-2 px-3 rounded-lg hover:bg-gray-100 cursor-pointer">Downloads</li>
              <li onClick={() => { router.push('/profile'); setIsMenuOpen(false); }} className="py-2 px-3 rounded-lg hover:bg-gray-100 cursor-pointer">Profile</li>
            </ul>

            <button
              onClick={() => { signOut(); setIsMenuOpen(false); }}
              className="w-full rounded-full px-6 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 text-white font-semibold"
            >
              Logout
            </button>

          </div>
        </div>
      )}
    </nav>
  );
}