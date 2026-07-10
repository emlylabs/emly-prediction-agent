import { cn } from '@/lib/utils';

function Input({ className, type = 'text', ...props }) {
  return <input type={type} className={cn('ui-input', className)} {...props} />;
}

export { Input };
