import { createContext } from "react";

export const WorkspacePaneContext = createContext<{
  groupId: string;
  surfaceId: string | null;
  focused: boolean;
  toolbar: HTMLElement | null;
  closeTab: () => void;
  toggleMaximized: () => void;
} | null>(null);
