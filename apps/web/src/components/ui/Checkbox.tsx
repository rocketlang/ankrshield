/**
 * Checkbox Component
 * Reusable checkbox input
 */

import { InputHTMLAttributes } from 'react';

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export default function Checkbox({
  label,
  className = '',
  ...props
}: CheckboxProps) {
  return (
    <div className="flex items-center">
      <input
        type="checkbox"
        className={`w-5 h-5 bg-gray-800 border border-gray-700 rounded text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${className}`}
        {...props}
      />
      {label && (
        <label className="ml-3 text-sm text-gray-300">{label}</label>
      )}
    </div>
  );
}
