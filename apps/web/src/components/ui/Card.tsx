/**
 * Card Component
 * Reusable card container
 */

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'highlighted';
}

export default function Card({
  children,
  className = '',
  variant = 'default',
}: CardProps) {
  const variantStyles = {
    default: 'bg-gray-800 border-gray-700',
    highlighted: 'bg-blue-900/20 border-blue-700',
  };

  return (
    <div
      className={`rounded-lg border ${variantStyles[variant]} ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-6 py-4 border-b border-gray-700 ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`px-6 py-4 ${className}`}>{children}</div>;
}

export function CardFooter({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-6 py-4 border-t border-gray-700 ${className}`}>
      {children}
    </div>
  );
}
