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
};

type ItemProps = {
  value: string;
  children: React.ReactNode;
  onSelect?: (value: string) => void;
};

export function Select({ value, onValueChange, children, className, ...props }: SelectProps) {
  return (
    <div className={cn("relative", className)} {...props}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child) && child.type === SelectTrigger) {
          return React.cloneElement(child as React.ReactElement<TriggerProps>, { value });
        }
        if (React.isValidElement(child) && child.type === SelectContent) {
          const contentProps = child.props as { children?: React.ReactNode };
          return React.cloneElement(child as React.ReactElement<{ children?: React.ReactNode }>, {
            children: React.Children.map(contentProps.children, (grandChild) => {
              if (React.isValidElement(grandChild) && grandChild.type === SelectItem) {
                return React.cloneElement(grandChild as React.ReactElement<ItemProps>, {
                  onSelect: onValueChange,
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

export function SelectTrigger({ value, children, ...props }: TriggerProps) {
  return (
    <button
      type="button"
      className="w-full border px-3 py-2 rounded bg-white flex items-center justify-between"
      {...props}
    >
      <span>{children || value}</span>
      <span className="ml-2">▼</span>
    </button>
  );
}

export function SelectContent({ children, ...props }: { children: React.ReactNode }) {
  return (
    <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow" {...props}>
      {children}
    </div>
  );
}

export function SelectItem({ value, children, onSelect, ...props }: ItemProps) {
  return (
    <div
      className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
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
