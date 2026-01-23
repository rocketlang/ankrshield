/**
 * Spinner Component
 * Loading spinner with sizes
 */

export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-3',
  xl: 'w-16 h-16 border-4',
};

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div
      className={`
        border-gray-700 border-t-ankr-green rounded-full animate-spin
        ${sizeClasses[size]}
        ${className}
      `}
    />
  );
}

interface LoadingProps {
  message?: string;
  size?: SpinnerSize;
}

export function Loading({ message = 'Loading...', size = 'lg' }: LoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <Spinner size={size} />
      <p className="text-gray-400">{message}</p>
    </div>
  );
}
