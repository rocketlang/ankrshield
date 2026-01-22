/**
 * Alert Component
 * Notification/alert messages
 */

import { AlertCircle, CheckCircle, XCircle, Info, X } from 'lucide-react';
import { useState } from 'react';

interface AlertProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info';
  dismissible?: boolean;
  className?: string;
}

export default function Alert({
  children,
  variant = 'info',
  dismissible = false,
  className = '',
}: AlertProps) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  const variants = {
    success: {
      bg: 'bg-green-900/50 border-green-700',
      icon: <CheckCircle className="w-5 h-5 text-green-400" />,
      text: 'text-green-300',
    },
    warning: {
      bg: 'bg-yellow-900/50 border-yellow-700',
      icon: <AlertCircle className="w-5 h-5 text-yellow-400" />,
      text: 'text-yellow-300',
    },
    error: {
      bg: 'bg-red-900/50 border-red-700',
      icon: <XCircle className="w-5 h-5 text-red-400" />,
      text: 'text-red-300',
    },
    info: {
      bg: 'bg-blue-900/50 border-blue-700',
      icon: <Info className="w-5 h-5 text-blue-400" />,
      text: 'text-blue-300',
    },
  };

  const { bg, icon, text } = variants[variant];

  return (
    <div
      className={`flex items-start space-x-3 px-4 py-3 rounded-lg border ${bg} ${className}`}
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className={`flex-1 ${text}`}>{children}</div>
      {dismissible && (
        <button
          onClick={() => setIsVisible(false)}
          className="flex-shrink-0 text-gray-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
