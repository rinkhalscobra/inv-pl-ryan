import React from 'react';

interface BrandLogoProps {
  className?: string;
}

const BrandLogo: React.FC<BrandLogoProps> = ({ className = '' }) => (
  <img
    src="/logo.png"
    alt="Atlas Market"
    className={`block object-contain ${className}`}
    draggable={false}
  />
);

export default BrandLogo;
