import * as React from "react";
import { cn } from "@/lib/utils";

type SelectProps = {
  value: string;
  onValueChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
};

type TriggerProps = {
  value: string;
  children: React.ReactNode;
  className?: string;
  open?: boolean;
  onToggle?: () => void;
  triggerRef?: React.Ref<HTMLButtonElement>;
};

type ItemProps = {
  value: string;
  children: React.ReactNode;
  onSelect?: (value: string) => void;
  className?: string;
};

export function Select({ value, onValueChange, children, className, ...props }: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  type ContentProps = { children?: React.ReactNode; className?: string; contentRef?: React.Ref<HTMLDivElement> };

  React.useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (contentRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className={cn("relative", className)} {...props}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child) && child.type === SelectTrigger) {
          return React.cloneElement(child as React.ReactElement<TriggerProps>, {
            value,
            open,
            onToggle: () => setOpen((prev) => !prev),
            triggerRef,
          });
        }
        if (React.isValidElement(child) && child.type === SelectContent) {
          if (!open) return null;
          const contentProps = child.props as ContentProps;
          return React.cloneElement(child as React.ReactElement<ContentProps>, {
            contentRef,
            children: React.Children.map(contentProps.children, (grandChild) => {
              if (React.isValidElement(grandChild) && grandChild.type === SelectItem) {
                return React.cloneElement(grandChild as React.ReactElement<ItemProps>, {
                  onSelect: (nextValue: string) => {
                    onValueChange(nextValue);
                    setOpen(false);
                  },
                });
              }
              return grandChild;
            }),
          });
        }
        return child;
      })}
    </div>
  );
}

export function SelectTrigger({ value, children, open, onToggle, triggerRef, ...props }: TriggerProps) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      ref={triggerRef}
      className="w-full border px-3 py-2 rounded bg-white flex items-center justify-between"
      {...props}
    >
      <span>{children || value}</span>
      <span className={cn("ml-2 transition-transform", open && "rotate-180")}>▼</span>
    </button>
  );
}

export function SelectContent({
  children,
  contentRef,
  className,
  ...props
}: {
  children: React.ReactNode;
  contentRef?: React.Ref<HTMLDivElement>;
  className?: string;
}) {
  return (
    <div
      ref={contentRef}
      className={cn("absolute z-10 mt-1 w-full bg-white border rounded shadow max-h-64 overflow-auto", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SelectItem({ value, children, onSelect, className, ...props }: ItemProps) {
  return (
    <div
      className={cn("px-3 py-2 hover:bg-gray-100 cursor-pointer", className)}
      onClick={() => onSelect?.(value)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  return <span className="text-muted-foreground">{placeholder}</span>;
}
