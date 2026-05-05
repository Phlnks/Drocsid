import React from 'react';
export default function DrocsidLogo({ className = "w-6 h-6" }: { className?: string }) {
  // Use absolute path so Vite doesn't try to bundle a missing file
  const logoSrc = "/logo.png";
  
  return (
    <img 
      src={logoSrc}
      alt="Drocsid Logo"
      className={`${className} object-contain`}
      referrerPolicy="no-referrer"
    />
  );
}
