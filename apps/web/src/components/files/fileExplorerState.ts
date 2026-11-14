import * as Schema from "effect/Schema";
import { useLocalStorage } from "~/hooks/useLocalStorage";

export function useFileExplorerOpen() {
  return useLocalStorage("t3code.fileExplorerOpen", true, Schema.Boolean);
}
