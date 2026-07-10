import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva('ui-btn', {
  variants: {
    variant: {
      default: 'ui-btn-default',
      secondary: 'ui-btn-secondary',
      outline: 'ui-btn-outline',
      ghost: 'ui-btn-ghost',
      destructive: 'ui-btn-destructive',
    },
    size: {
      default: 'ui-btn-md',
      sm: 'ui-btn-sm',
      lg: 'ui-btn-lg',
      icon: 'ui-btn-icon',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? 'span' : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button };
