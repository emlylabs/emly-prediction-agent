import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

function Dialog({ ...props }) {
  return <DialogPrimitive.Root {...props} />;
}

function DialogTrigger({ ...props }) {
  return <DialogPrimitive.Trigger {...props} />;
}

function DialogPortal({ ...props }) {
  return <DialogPrimitive.Portal {...props} />;
}

function DialogClose({ ...props }) {
  return <DialogPrimitive.Close {...props} />;
}

function DialogOverlay({ className, style, ...props }) {
  return (
    <DialogPrimitive.Overlay
      className={cn('ui-dialog-overlay', className)}
      style={{ zIndex: 1300, ...style }}
      {...props}
    />
  );
}

function DialogContent({ className, children, showClose = true, style, ...props }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn('ui-dialog-content', className)}
        style={{ zIndex: 1310, ...style }}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close className="ui-dialog-close" aria-label="Close dialog">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }) {
  return <div className={cn('ui-dialog-header', className)} {...props} />;
}

function DialogFooter({ className, ...props }) {
  return <div className={cn('ui-dialog-footer', className)} {...props} />;
}

function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title className={cn('ui-dialog-title', className)} {...props} />;
}

function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description className={cn('ui-dialog-description', className)} {...props} />;
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
