import { cn } from '@/lib/utils/cn';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'default' | 'outline' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  default: 'bg-zinc-900 text-zinc-50 hover:bg-zinc-800 disabled:bg-zinc-300',
  outline: 'border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-900',
  ghost: 'hover:bg-zinc-100 text-zinc-900',
  destructive: 'bg-red-600 text-white hover:bg-red-500',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm rounded-md',
  md: 'h-10 px-4 text-sm rounded-md',
  lg: 'h-11 px-6 text-base rounded-md',
  icon: 'h-9 w-9 rounded-md',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({ className, variant = 'default', size = 'md', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
