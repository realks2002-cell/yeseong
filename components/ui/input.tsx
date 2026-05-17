import { cn } from '@/lib/utils/cn';
import type { InputHTMLAttributes } from 'react';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-[5px] border border-[#D7D7D7] bg-white px-3 text-sm text-[#091413]',
        'focus:outline-none focus:ring-2 focus:ring-[#447D9B] focus:ring-offset-1',
        'placeholder:text-[#9CA3AF] disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}
