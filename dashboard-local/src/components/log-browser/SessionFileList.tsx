import { useState } from "react";
import type { ExportedFolder } from "../../types";
import { Button, ButtonSize, ButtonVariant } from "../Button";

/** Collapsible list of the files in a run's Claude Code session export; each opens in the file viewer. */
export function SessionFileList({
  folder,
  onSelectFile,
}: {
  folder: ExportedFolder;
  onSelectFile: (filename: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (folder.files.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-white/[0.04] transition-colors"
      >
        <span className="text-[10px] text-dim">{expanded ? "▾" : "▸"}</span>
        <span className="text-[10px] text-dim">
          Claude Code sessions ({folder.files.length} file{folder.files.length !== 1 ? "s" : ""})
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col items-start gap-0.5 ml-4 mt-0.5">
          {folder.files.map((file) => (
            <Button
              key={file}
              onClick={() => onSelectFile(`${folder.dir}/${file}`)}
              variant={ButtonVariant.Pill}
              size={ButtonSize.XS}
              className="font-mono text-left"
            >
              {file}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
