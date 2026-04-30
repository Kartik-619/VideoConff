'use client';

import React from 'react';

interface Props {
  userName?: string;
  userImage?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-12 h-12 text-sm',
  md: 'w-20 h-20 text-lg',
  lg: 'w-32 h-32 text-2xl'
};

export default function UserAvatar({ 
  userName, 
  userImage, 
  size = 'md',
  className = ''
}: Props) {
  const getInitial = (name?: string) => {
    if (!name) return 'U';
    return name.charAt(0).toUpperCase();
  };

  return (
    <div className={`
      relative rounded-full 
      bg-gradient-to-br from-blue-500 to-purple-600 
      flex items-center justify-center 
      text-white font-semibold
      shadow-lg
      ring-4 ring-white/20
      backdrop-blur-sm
      ${sizeClasses[size]}
      ${className}
    `}>
      {userImage ? (
        <img
          src={userImage}
          alt={userName || 'User'}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <span className="drop-shadow-md">
          {getInitial(userName)}
        </span>
      )}
      
      {/* Subtle animated pulse effect */}
      <div className="absolute inset-0 rounded-full bg-white/20 animate-pulse" />
    </div>
  );
}
