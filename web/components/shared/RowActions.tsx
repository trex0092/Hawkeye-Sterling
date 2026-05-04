"use client";

import type { MouseEvent } from "react";

// Shared right-aligned row-action cluster: ✎ edit + × delete.
// Glyph weight matches the existing × pattern (Unicode marks, no SVG)
// so it slots into existing tables without redesign.
//
// Usage:
//   <td className="w-[60px] px-2 py-3">
//     <RowActions
//       onEdit={() => openEditDrawer(record.id)}
//       onDelete={() => confirmDelete(record.id)}
//       label={record.subject}
//     />
//   </td>

interface RowActionsProps {
  // Click handler for edit (✎). When omitted, only delete is rendered.
  onEdit?: ((e: MouseEvent<HTMLButtonElement>) => void) | undefined;
  // Click handler for delete (×). Required.
  onDelete: (e: MouseEvent<HTMLButtonElement>) => void;
  // Used for aria-label so screen readers announce which row is acted on.
  label: string;
  // When the host table has its own delete-confirm flow, set
  // confirmDelete={false} to skip the built-in window.confirm.
  confirmDelete?: boolean;
  // Custom confirm message — only used when confirmDelete is true.
  deleteConfirmMessage?: string;
}

const BTN =
  "w-[18px] h-[18px] rounded-sm flex items-center justify-center text-11 leading-none transition-all hover:scale-110";
const EDIT_CLS = "text-blue-400 hover:bg-blue/10 hover:text-blue-500";
const DELETE_CLS = "text-red hover:bg-red-dim hover:text-red";

export function RowActions({
  onEdit,
  onDelete,
  label,
  confirmDelete = true,
  deleteConfirmMessage,
}: RowActionsProps) {
  const handleDelete = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (confirmDelete) {
      const msg = deleteConfirmMessage ?? `Delete ${label}?`;
      if (!window.confirm(msg)) return;
    }
    onDelete(e);
  };

  const handleEdit = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onEdit) onEdit(e);
  };

  return (
    <div className="inline-flex items-center gap-px">
      {onEdit && (
        <button
          type="button"
          aria-label={`Edit ${label}`}
          title="Edit"
          onClick={handleEdit}
          className={`${BTN} ${EDIT_CLS}`}
        >
          ✎
        </button>
      )}
      <button
        type="button"
        aria-label={`Delete ${label}`}
        title="Delete"
        onClick={handleDelete}
        className={`${BTN} ${DELETE_CLS}`}
      >
        ×
      </button>
    </div>
  );
}
