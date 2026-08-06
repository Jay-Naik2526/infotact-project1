import React, { memo, useState } from 'react';
import type { IMessage } from '../../types/index.ts';
import MessageActions from "./MessageActions";
import MessageAttachments from "./MessageAttachments";
import MessageReactionBar from "./MessageReactionBar";
import ReactionPicker from "./ReactionPicker";

interface MessageItemProps {
  message: IMessage;
  isOwn: boolean;
  onReply: (message: IMessage) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  currentUserId?: string;
  onToggleReaction: (messageId: string, emoji: string) => void;
}

const getInitials = (name?: string) => {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0]!.substring(0, 2).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
};

const formatTime = (isoString: string) => {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    return '';
  }
};

export const MessageItem: React.FC<MessageItemProps> = memo(({
  message,
  isOwn,
  onReply,
  onEdit,
  onDelete,
  currentUserId,
  onToggleReaction,
}) => {
  const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false);
  const displayName = message.senderName || 'User';
  const initials = getInitials(displayName);
  const timeStr = formatTime(message.timestamp);
  const hasAttachments = !!message.attachments?.length;
  const hasContent = !!message.content?.trim();

  return (
    <div className={`group relative flex gap-3 items-end w-full mb-4 px-4 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-primary flex items-center justify-center text-white text-xs font-semibold select-none shadow-sm shadow-accent-primary/20">
        {initials}
      </div>

    <div
      className={`relative flex flex-col max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}
      onMouseEnter={() => setIsReactionPickerOpen(true)}
      onMouseLeave={() => setIsReactionPickerOpen(false)}
    >

      <ReactionPicker
        isOpen={isReactionPickerOpen}
        onSelect={(emoji) => {
          onToggleReaction(message.id, emoji);
          setIsReactionPickerOpen(false);
        }}
      />

  <MessageActions
    content={message.content}
    isOwn={isOwn}
    onReply={() => onReply(message)}
    onEdit={() => onEdit(message.id)}
    onDelete={() => onDelete(message.id)}
  />

      <span className="text-xs font-medium text-text-muted mb-1 font-heading">
        {displayName}
      </span>

      <div
        className={`px-4 py-2.5 rounded-[4px] text-sm leading-relaxed font-body shadow-sm break-words w-full
          ${isOwn
            ? 'bg-accent-primary text-white rounded-br-none'
            : 'glass-card border border-white/5 text-[#F1F5F9] rounded-bl-none'
          }`}
      >
        {message.replyTo && (
        <div className="mb-3 rounded-md border-l-2 border-violet-500 bg-black/20 p-2">
          <p className="text-xs font-semibold text-violet-400">
            Reply to {message.replyTo.senderName}
          </p>

          <p className="truncate text-xs text-gray-400">
            {message.replyTo.content || "Attachment"}
          </p>
        </div>
      )}

        {hasContent && <p>{message.content}</p>}

        {hasAttachments && (
          <MessageAttachments attachments={message.attachments!} />
        )}
      </div>

      <MessageReactionBar
        reactions={message.reactions}
        currentUserId={currentUserId}
        onToggle={(emoji) => onToggleReaction(message.id, emoji)}
      />

      <span className="text-[10px] text-text-muted mt-1 font-mono tracking-wider">
        {timeStr}
      </span>
    </div>
    </div>
  );
});

export default MessageItem;
