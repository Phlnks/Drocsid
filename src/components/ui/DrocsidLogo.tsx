import React from 'react';

export default function DrocsidLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <img 
      src="/logo.png"
      alt="Drocsid Logo"
      className={`${className} object-contain`}
      referrerPolicy="no-referrer"
    />
  );
}
