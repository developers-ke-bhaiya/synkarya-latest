import React from 'react';
import { getInitials } from '../../utils/formatters';

const COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-pink-500 to-rose-600',
  'from-indigo-500 to-blue-600',
];

const getColor = (name = '') => {
  const idx = name.charCodeAt(0) % COLORS.length;
  return COLORS[idx];
};

export const Avatar = ({ name = '', size = 'md', className = '' }) => {
  const sizes = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };

  return (
    <div
      className={`${sizes[size]} rounded-full bg-gradient-to-br ${getColor(name)}
        flex items-center justify-center font-bold text-white flex-shrink-0 ${className}`}
    >
      {getInitials(name)}
    </div>
  );
};
