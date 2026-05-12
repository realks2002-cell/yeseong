import { cn } from '@/lib/utils/cn';
import type { InputHTMLAttributes } from 'react';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm',
        'focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-1',
        'placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}
