import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { Request, Response } from "express";
import Message from "../models/Message";
import Channels from "../models/Channels";
import Workspace from "../models/Workspace";
import User from "../models/User";
import { io } from "../socket/socketServer";
import { sanitizeFilename } from "../utils/fileConfig";
import { formatMessageResponse } from "../utils/formatMessageResponse";
import { createNotification } from "../services/notification.service";

const uploadsDir = path.join(__dirname, "../../uploads");
const buildAttachmentsFromFiles = (files: Express.Multer.File[] = []) => files.map((file) => ({ filename: file.filename, originalName: sanitizeFilename(file.originalname), mimeType: file.mimetype, size: file.size, url: `/uploads/${file.filename}` }));
const removeAttachmentFiles = (attachments: { filename: string }[] = []) => attachments.forEach(({ filename }) => { const filePath = path.join(uploadsDir, filename); if (fs.existsSync(filePath)) fs.unlinkSync(filePath); });

const getMembership = async (channelId: string, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(channelId)) return { status: 400, error: "Invalid channelId" } as const;
  const channel = await Channels.findById(channelId);
  if (!channel) return { status: 404, error: "Channel not found" } as const;
  const workspace = await Workspace.findById(channel.workspace);
  if (!workspace) return { status: 404, error: "Workspace not found" } as const;
  if (!workspace.members.some((member) => member.toString() === userId)) return { status: 403, error: "You are not a member of this workspace" } as const;
  return { channel, workspace };
};

const populateMessage = (id: mongoose.Types.ObjectId) => Message.findById(id).populate("sender", "name email").populate({ path: "replyTo", populate: { path: "sender", select: "name" } });

export const createMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { content = "", replyTo, clientTempId } = req.body;
    const channelId = typeof req.body.channelId === "string" ? req.body.channelId : "";
    const userId = req.user!.id;
    const uploadedFiles = (req.files as Express.Multer.File[]) || [];
    const trimmedContent = String(content).trim();
    if (!channelId || (!trimmedContent && uploadedFiles.length === 0) || trimmedContent.length > 1000) {
      removeAttachmentFiles(uploadedFiles.map((file) => ({ filename: file.filename })));
      res.status(400).json({ success: false, message: !channelId ? "channelId is required" : trimmedContent.length > 1000 ? "Message content cannot exceed 1000 characters" : "Message must include text or at least one attachment" });
      return;
    }
    const membership = await getMembership(channelId, userId);
    if ("error" in membership) { removeAttachmentFiles(uploadedFiles.map((file) => ({ filename: file.filename }))); res.status(membership.status ?? 500).json({ success: false, message: membership.error }); return; }
    const message = await Message.create({ content: trimmedContent, attachments: buildAttachmentsFromFiles(uploadedFiles), sender: userId, channel: channelId, replyTo: replyTo || null });
    const populated = await populateMessage(message._id);
    if (!populated) { res.status(404).json({ success: false, message: "Message not found" }); return; }
    const formatted = formatMessageResponse(populated);
    const messagePayload = { message: formatted, clientTempId };
    io.to(channelId).emit("chat:message", { ...formatted, clientTempId });
    io.to(channelId).emit("message:new", messagePayload);

    const actor = await User.findById(userId).select("name");
    const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const recipients = new Set<string>();
    for (const match of trimmedContent.matchAll(/@([a-zA-Z0-9._-]+)/g)) {
      const mentioned = await User.findOne({ name: new RegExp(`^${escaped(match[1])}$`, "i") }).select("_id");
      if (mentioned && mentioned.id !== userId) recipients.add(mentioned.id);
    }
    await Promise.all(
      [...recipients].map((recipient) =>
        createNotification({
          recipient,
          actor: userId,
          type: "message:mention",
          title: "You were mentioned",
          body: `${actor?.name || "Someone"} mentioned you in #${membership.channel.name}.`,
          workspace: membership.workspace._id,
          channel: membership.channel._id,
          message: message._id,
        })
      )
    );

    const replyOwner = (populated.replyTo as any)?.sender?._id?.toString();

    if (replyOwner && replyOwner !== userId) {
      await createNotification({
        recipient: replyOwner,
        actor: userId,
        type: "message:reply",
        title: "New reply",
        body: `${actor?.name || "Someone"} replied to your message in #${membership.channel.name}.`,
        workspace: membership.workspace._id,
        channel: membership.channel._id,
        message: message._id,
      });
    }

    const workspaceId = membership.workspace._id.toString();

    io.to(workspaceId).emit("workspace:message", {
      workspaceId,
      channelId,
      message: formatted,
    });

    res.status(201).json({
      success: true,
      message: "Message created successfully",
      data: {
        ...formatted,
        clientTempId,
      },
    });
  } catch (error) {
    console.error("Create Message Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }

export const getMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const channelId = req.query.channelId as string;
    const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    if (!channelId) { res.status(400).json({ success: false, message: "channelId is required" }); return; }
    const membership = await getMembership(channelId, req.user!.id);
    if ("error" in membership) { res.status(membership.status ?? 500).json({ success: false, message: membership.error }); return; }
    const messages = await Message.find({ channel: channelId }).populate("sender", "name email").populate({ path: "replyTo", populate: { path: "sender", select: "name" } }).sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit);
    res.status(200).json({ success: true, total: await Message.countDocuments({ channel: channelId }), page, limit, data: messages.map(formatMessageResponse) });
  } catch (error) { console.error("Get Messages Error:", error); res.status(500).json({ success: false, message: "Internal Server Error" }); }
};

export const updateMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params; const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
    if (!content || content.length > 1000) { res.status(400).json({ success: false, message: "Message content must be between 1 and 1000 characters" }); return; }
    const message = await Message.findById(id);
    if (!message) { res.status(404).json({ success: false, message: "Message not found" }); return; }
    if (message.sender.toString() !== req.user!.id) { res.status(403).json({ success: false, message: "Unauthorized" }); return; }
    message.content = content; await message.save(); const populated = await populateMessage(message._id); const formatted = formatMessageResponse(populated!);
    io.to(message.channel.toString()).emit("message:update", { message: formatted }); io.to(message.channel.toString()).emit("chat:update", { message: formatted });
    res.status(200).json({ success: true, message: "Message updated successfully", data: formatted });
  } catch (error) { console.error("Update Message Error:", error); res.status(500).json({ success: false, message: "Internal Server Error" }); }
};

export const toggleMessageReaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawMessageId = req.params.messageId;
    const messageId = Array.isArray(rawMessageId) ? rawMessageId[0] : rawMessageId;
    const emoji = typeof req.body.emoji === "string" ? req.body.emoji.trim() : ""; const userId = req.user!.id;
    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) { res.status(400).json({ success: false, message: "Invalid messageId" }); return; }
    if (!emoji || emoji.length > 32) { res.status(400).json({ success: false, message: "A valid emoji is required" }); return; }
    const existing = await Message.findById(messageId);
    if (!existing) { res.status(404).json({ success: false, message: "Message not found" }); return; }
    const membership = await getMembership(existing.channel.toString(), userId);
    if ("error" in membership) { res.status(membership.status ?? 500).json({ success: false, message: membership.error }); return; }
    // Mutating the hydrated document avoids the inconsistent ObjectId casting and
    // aggregation-pipeline behaviour that caused reactions to toggle twice.
    const reaction = existing.reactions.find((item) => item.emoji === emoji);
    let didAddReaction = false;
    if (reaction) {
      const userIndex = reaction.users.findIndex((id) => id.toString() === userId);
      if (userIndex >= 0) reaction.users.splice(userIndex, 1);
      else { reaction.users.push(new mongoose.Types.ObjectId(userId)); didAddReaction = true; }
      if (reaction.users.length === 0) {
        existing.reactions = existing.reactions.filter((item) => item.emoji !== emoji);
      }
    } else {
      existing.reactions.push({ emoji, users: [new mongoose.Types.ObjectId(userId)] });
      didAddReaction = true;
    }
    await existing.save();

    const message = existing;
    const formatted = formatMessageResponse(message);

    const reactionPayload = {
      messageId: formatted.id,
      reactions: formatted.reactions,
    };

    if (io) {
      io.to(message.channel.toString()).emit(
        "message:reaction",
        reactionPayload
      );

      // Keep the newer event name as well for compatibility.
      io.to(message.channel.toString()).emit(
        "chat:reaction",
        reactionPayload
      );
    }

    if (
      didAddReaction &&
      message.sender.toString() !== userId
    ) {
      const actor = await User.findById(userId).select("name");

      await createNotification({
        recipient: message.sender,
        actor: userId,
        type: "message:reaction",
        title: "New reaction",
        body: `${actor?.name || "Someone"} reacted ${emoji} to your message.`,
        workspace: membership.workspace._id,
        channel: message.channel,
        message: message._id,
      });
    }

    res.status(200).json({
      success: true,
      message: "Message reaction updated successfully",
      data: formatted,
    });
  } catch (error) {
    console.error(
      "Toggle Message Reaction Error:",
      error instanceof Error ? error.stack : error
    );

    res.status(500).json({
      success: false,
      message: "Unable to update message reaction",
    });
  }
};

export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params; const message = await Message.findById(id);
    if (!message) { res.status(404).json({ success: false, message: "Message not found" }); return; }
    if (message.sender.toString() !== req.user!.id) { res.status(403).json({ success: false, message: "Unauthorized" }); return; }
    removeAttachmentFiles(message.attachments || []); const channelId = message.channel.toString(); await message.deleteOne();
    io.to(channelId).emit("message:delete", { messageId: id, channelId }); io.to(channelId).emit("chat:delete", { messageId: id, channelId });
    res.status(200).json({ success: true, message: "Message deleted successfully" });
  } catch (error) { console.error("Delete Message Error:", error); res.status(500).json({ success: false, message: "Internal Server Error" }); }
};
