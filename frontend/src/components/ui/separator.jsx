import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';

function Separator({ className, orientation = 'horizontal', decorative = true, ...props }) {
  return <SeparatorPrimitive.Root decorative={decorative} orientation={orientation} className={cn('ui-separator', className)} {...props} />;
}

export { Separator };
