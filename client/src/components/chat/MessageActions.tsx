import React from "react";
import { Copy, Pencil, Trash2, Reply } from "lucide-react";

interface Props {
  content: string;
  isOwn: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const MessageActions: React.FC<Props> = ({
  content,
  isOwn,
  onReply,
  onEdit,
  onDelete,
}) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (error) {
      console.error("Failed to copy message:", error);
    }
  };

  return (
    <div className="absolute right-2 top-0 hidden group-hover:flex items-center gap-1 rounded-lg border border-[#1E293B] bg-[#111118] p-1 shadow-xl">
      <button
        title="Copy"
        onClick={handleCopy}
        className="rounded p-2 hover:bg-[#1A1A24]"
      >
        <Copy size={15} />
      </button>

      <button
        title="Reply"
        onClick={onReply}
        className="rounded p-2 hover:bg-[#1A1A24]"
      >
        <Reply size={15} />
      </button>

      {isOwn && (
        <>
          <button
            title="Edit"
            onClick={onEdit}
            className="rounded p-2 hover:bg-[#1A1A24]"
          >
            <Pencil size={15} />
          </button>

          <button
            title="Delete"
            onClick={onDelete}
            className="rounded p-2 text-red-400 hover:bg-red-500/20"
          >
            <Trash2 size={15} />
          </button>
        </>
      )}
    </div>
  );
};

export default MessageActions;