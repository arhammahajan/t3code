import type { RefObject } from "react";
import { SquareMenu } from "lucide-react";
import { Button } from "../ui/button";
import { PopoverCreateHandle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function WorkspaceControlsButton({
  anchor,
  handle,
  shortcut,
}: {
  anchor: RefObject<HTMLButtonElement | null>;
  handle: ReturnType<typeof PopoverCreateHandle>;
  shortcut: string | null;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <PopoverTrigger
            ref={anchor}
            handle={handle}
            render={<Button variant="ghost-muted" size="icon-xs" aria-label="Workspace controls" />}
          />
        }
      >
        <SquareMenu className="size-3.5" />
      </TooltipTrigger>
      <TooltipPopup>Workspace controls{shortcut ? ` (${shortcut})` : ""}</TooltipPopup>
    </Tooltip>
  );
}
