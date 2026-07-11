import { cn } from '@/lib/utils';

function Textarea({ className, ...props }) {
  return <textarea className={cn('ui-textarea', className)} {...props} />;
}

export { Textarea };
