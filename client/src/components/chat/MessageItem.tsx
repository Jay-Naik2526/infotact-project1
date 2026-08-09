import React, { memo, useState } from 'react';
import type { IMessage } from '../../types/index.ts';
import MessageActions from "./MessageActions";
import MessageAttachments from "./MessageAttachments";
import MessageReactionBar from "./MessageReactionBar";
import ReactionPicker from "./ReactionPicker";

interface MessageItemProps {
  message: IMessage;
  isOwn: boolean;
  grouped?: boolean;
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
  grouped = false,
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
    <div className={`group relative flex gap-3 items-end w-full px-5 ${grouped ? 'mb-1 mt-0' : 'mb-3 mt-1'} ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-9 ${grouped ? 'h-4' : 'h-9'} rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white text-xs font-bold select-none shadow-lg shadow-violet-600/20 ${grouped ? 'opacity-0' : ''}`}>
        {!grouped && initials}
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

      {!grouped && <span className="mb-1 flex items-baseline gap-2 text-xs font-semibold text-slate-200 font-heading">
        {displayName}<span className="font-normal text-slate-500">{timeStr}</span>
      </span>}

      <div
        className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed font-body shadow-sm break-words w-full transition-all duration-200 group-hover:shadow-lg group-hover:shadow-violet-950/30
          ${isOwn
            ? 'bg-gradient-to-br from-violet-600 to-violet-700 text-white rounded-br-md'
            : 'glass-card border border-white/8 bg-white/[0.035] text-[#F1F5F9] rounded-bl-md group-hover:border-violet-400/20'
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

      {grouped && <span className="opacity-0 transition-opacity group-hover:opacity-100 text-[10px] text-text-muted mt-0.5 font-mono tracking-wider">{timeStr}</span>}
    </div>
    </div>
  );
});

export default MessageItem;
