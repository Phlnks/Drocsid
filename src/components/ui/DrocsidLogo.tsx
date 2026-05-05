import React from 'react';
import logo from '../../assets/logo.png';

export default function DrocsidLogo({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <img 
      src={logo}
      alt="Drocsid Logo"
      className={`${className} object-contain`}
      referrerPolicy="no-referrer"
    />
  );
}
