import React from 'react';

export const Spinner = ({ size = 'md', className = '' }) => {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };
  return (
    <div className={`${sizes[size]} ${className} animate-spin rounded-full
      border-2 border-white/10 border-t-amber-400`} />
  );
};
