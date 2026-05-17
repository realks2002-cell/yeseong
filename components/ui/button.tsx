import { cn } from '@/lib/utils/cn';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'default' | 'outline' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  default: 'bg-[#447D9B] text-white hover:bg-[#366379] disabled:bg-[#D7D7D7]',
  outline: 'border border-[#D7D7D7] bg-white hover:bg-[#F5F5F5] text-[#091413]',
  ghost: 'hover:bg-[#F5F5F5] text-[#091413]',
  destructive: 'bg-red-600 text-white hover:bg-red-500',
};

const sizes: Record<Size, string> = {
  sm: 'h-[27px] px-2.5 text-xs rounded-[5px]',
  md: 'h-[34px] px-3.5 text-[13px] rounded-[5px]',
  lg: 'h-[37px] px-5 text-sm rounded-[5px]',
  icon: 'h-[31px] w-[31px] rounded-[5px]',
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
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#447D9B] focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
