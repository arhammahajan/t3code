import { Columns2, Rows2, Ellipsis, Maximize2, Minimize2, PanelLeftClose } from "lucide-react";
import { useWorkspaceStore } from "~/workspaceStore";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function WorkspaceGroupActions({
  groupId,
  multiple,
}: {
  groupId: string;
  multiple: boolean;
}) {
  const maximized = useWorkspaceStore((state) => state.maximizedGroupId === groupId);
  return (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost-muted"
              size="icon-xs"
              aria-label="Split editor right"
              onClick={() => useWorkspaceStore.getState().split(groupId, "horizontal")}
            />
          }
        >
          <Columns2 className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup>Split right</TooltipPopup>
      </Tooltip>
      <Menu>
        <MenuTrigger
          render={<Button variant="ghost-muted" size="icon-xs" aria-label="Editor group options" />}
        >
          <Ellipsis className="size-4" />
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuItem onClick={() => useWorkspaceStore.getState().split(groupId, "horizontal")}>
            <Columns2 />
            Split right
          </MenuItem>
          <MenuItem onClick={() => useWorkspaceStore.getState().split(groupId, "vertical")}>
            <Rows2 />
            Split down
          </MenuItem>
          {multiple ? (
            <>
              <MenuSeparator />
              <MenuItem onClick={() => useWorkspaceStore.getState().toggleMaximized(groupId)}>
                {maximized ? <Minimize2 /> : <Maximize2 />}
                {maximized ? "Show all groups" : "Focus this group"}
              </MenuItem>
              <MenuItem onClick={() => useWorkspaceStore.getState().join(groupId)}>
                <PanelLeftClose />
                Join with adjacent group
              </MenuItem>
            </>
          ) : null}
        </MenuPopup>
      </Menu>
    </div>
  );
}
