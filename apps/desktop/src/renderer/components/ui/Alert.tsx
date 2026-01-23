/**
 * Alert Component
 * Alert messages with variants
 */

import { ReactNode } from 'react';

export type AlertVariant = 'success' | 'warning' | 'danger' | 'info';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<AlertVariant, string> = {
  success: 'bg-green-500/10 border-green-500/30 text-green-400',
  warning: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
  danger: 'bg-red-500/10 border-red-500/30 text-red-400',
  info: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
};

const iconMap: Record<AlertVariant, string> = {
  success: '✓',
  warning: '⚠',
  danger: '✕',
  info: 'ℹ',
};

export function Alert({ variant = 'info', title, children, className = '' }: AlertProps) {
  return (
    <div
      className={`
        rounded-lg border p-4
        ${variantClasses[variant]}
        ${className}
      `}
    >
      <div className="flex gap-3">
        <div className="flex-shrink-0 text-lg">
          {iconMap[variant]}
        </div>
        <div className="flex-1">
          {title && (
            <h4 className="font-semibold mb-1">{title}</h4>
          )}
          <div className="text-sm opacity-90">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
