import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { Search } from "lucide-react";
import { isElectron } from "~/env";
import type { ComponentProps, ReactNode } from "react";

export function WorkspaceDockHeader({
  label,
  children,
  windowTitlebar = false,
}: {
  label: string;
  children?: ReactNode;
  windowTitlebar?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-10 min-h-10 shrink-0 items-center gap-2 border-b border-sidebar-border/50 bg-sidebar px-3",
        windowTitlebar &&
          isElectron &&
          "drag-region h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] wco:pr-(--workspace-native-controls-inset)",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground">
        {label}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">{children}</div>
    </div>
  );
}

export function WorkspaceDockSearch({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-sm text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-within:bg-sidebar-row-hover focus-within:text-sidebar-foreground focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring/70">
      <Search className="size-3.5 shrink-0 text-(--sidebar-icon-color)" />
      {children}
    </div>
  );
}

export function WorkspaceDockAction({
  label,
  tooltip = label,
  children,
  className,
  size = "icon-sm",
  ...props
}: Omit<ComponentProps<typeof Button>, "aria-label" | "children"> & {
  label: string;
  tooltip?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            {...props}
            variant="ghost-muted"
            size={size}
            aria-label={label}
            className={cn("relative shrink-0", className)}
          />
        }
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
        />
      </TooltipTrigger>
      <TooltipPopup>{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
