import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

function Progress({ className, value = 0, ...props }) {
  const normalized = Math.max(0, Math.min(100, value));

  return (
    <ProgressPrimitive.Root className={cn('ui-progress', className)} value={normalized} {...props}>
      <ProgressPrimitive.Indicator className="ui-progress-indicator" style={{ width: `${normalized}%` }} />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
