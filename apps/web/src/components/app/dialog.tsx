"use client";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

/**
 * Responsive dialog (shadcn/ui pattern): a Drawer bottom sheet on phones, a Dialog on desktop.
 * Radix/vaul provide the focus trap, Escape handling and aria wiring (docs/05_web).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="border-b pb-3 text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription className={description ? undefined : "sr-only"}>
              {description ?? title}
            </DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
          {footer ? (
            <DrawerFooter className="flex-row flex-wrap justify-end border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {footer}
            </DrawerFooter>
          ) : null}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("flex max-h-[90dvh] flex-col gap-0 bg-card p-0", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}
      >
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? "text-[13px]" : "sr-only"}>
            {description ?? title}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <DialogFooter className="flex-wrap border-t px-5 py-3">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
