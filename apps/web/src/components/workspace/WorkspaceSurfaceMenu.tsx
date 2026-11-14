import {
  Plus,
  MessageSquare,
  Folder,
  TerminalSquare,
  GitCompare,
  Globe,
  Smartphone,
  MessagesSquare,
} from "lucide-react";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const icons = new Map([
  ["New chat", MessageSquare],
  ["Files", Folder],
  ["Terminal", TerminalSquare],
  ["Changes", GitCompare],
  ["Browser", Globe],
  ["Device", Smartphone],
  ["Pull request", PullRequestGlyph.pullRequest],
  ["Pull requests", PullRequestGlyph.stack],
  ["Side chat", MessagesSquare],
]);

export function WorkspaceSurfaceMenu({
  actions,
}: {
  actions: ReadonlyArray<{ label: string; available: boolean; onClick: () => void }>;
}) {
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <Button variant="ghost-muted" size="icon-xs" aria-label="Open workspace tab" />
              }
            />
          }
        >
          <Plus className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup>Open a tab</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end">
        {actions
          .filter((action) => action.available)
          .map((action) => {
            const Icon = icons.get(action.label) ?? Plus;
            return (
              <MenuItem key={action.label} onClick={action.onClick}>
                <Icon />
                {action.label}
              </MenuItem>
            );
          })}
      </MenuPopup>
    </Menu>
  );
}
