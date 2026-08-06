import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import Message from "../models/Message";
import Channels from "../models/Channels";
import { io } from "../socket/socketServer";
import { sanitizeFilename } from "../utils/fileConfig";
import { formatMessageResponse } from "../utils/formatMessageResponse";
import mongoose from "mongoose";

const uploadsDir = path.join(__dirname, "../../uploads");

const buildAttachmentsFromFiles = (files: Express.Multer.File[] = []) =>
  files.map((file) => ({
    filename: file.filename,
    originalName: sanitizeFilename(file.originalname),
    mimeType: file.mimetype,
    size: file.size,
    url: `/uploads/${file.filename}`,
  }));

const removeAttachmentFiles = (attachments: { filename: string }[] = []) => {
  for (const attachment of attachments) {
    const filePath = path.join(uploadsDir, attachment.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
};

// ======================
// Create Message
// ======================
export const createMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { content = "", channelId, replyTo, clientTempId } = req.body;
    const userId = req.user!.id;
    const uploadedFiles = (req.files as Express.Multer.File[]) || [];
    const trimmedContent = String(content).trim();

    if (!channelId) {
      if (uploadedFiles.length > 0) {
        removeAttachmentFiles(
          uploadedFiles.map((file) => ({ filename: file.filename }))
        );
      }

      res.status(400).json({
        success: false,
        message: "channelId is required",
      });
      return;
    }

    if (!trimmedContent && uploadedFiles.length === 0) {
      res.status(400).json({
        success: false,
        message: "Message must include text or at least one attachment",
      });
      return;
    }

    if (trimmedContent.length > 1000) {
      if (uploadedFiles.length > 0) {
        removeAttachmentFiles(
          uploadedFiles.map((file) => ({ filename: file.filename }))
        );
      }

      res.status(400).json({
        success: false,
        message: "Message content cannot exceed 1000 characters",
      });
      return;
    }

    const channel = await Channels.findById(channelId);
    if (!channel) {
      if (uploadedFiles.length > 0) {
        removeAttachmentFiles(
          uploadedFiles.map((file) => ({ filename: file.filename }))
        );
      }

      res.status(404).json({
        success: false,
        message: "Channel not found",
      });
      return;
    }

    const attachments = buildAttachmentsFromFiles(uploadedFiles);

    const message = await Message.create({
      content: trimmedContent,
      attachments,
      sender: userId,
      channel: channelId,
      replyTo: replyTo || null,
    });

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name email")
      .populate({
        path: "replyTo",
        populate: {
          path: "sender",
          select: "name",
        },
      });

    if (!populatedMessage) {
      res.status(404).json({
        success: false,
        message: "Message not found",
      });
      return;
    }

    const formatted = formatMessageResponse(populatedMessage);

    io.to(channelId).emit("chat:message", {
      ...formatted,
      clientTempId,
    });

    const workspaceId = channel.workspace.toString();
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
};

// ======================
// Get Messages
// ======================
export const getMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const channelId = req.query.channelId as string;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    if (!channelId) {
      res.status(400).json({
        success: false,
        message: "channelId is required",
      });
      return;
    }

    const skip = (page - 1) * limit;

    const messages = await Message.find({ channel: channelId })
      .populate("sender", "name email")
      .populate({
        path: "replyTo",
        populate: {
          path: "sender",
          select: "name",
        },
      })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({ channel: channelId });

    const formatted = messages.map((msg) => formatMessageResponse(msg));

    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      data: formatted,
    });
  } catch (error) {
    console.error("Get Messages Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ======================
// Update Message
// ======================
export const updateMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user!.id;

    const message = await Message.findById(id);

    if (!message) {
      res.status(404).json({
        success: false,
        message: "Message not found",
      });
      return;
    }

    if (message.sender.toString() !== userId) {
      res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    message.content = content;
    await message.save();

    res.status(200).json({
      success: true,
      message: "Message updated successfully",
      data: message,
    });
  } catch (error) {
    console.error("Update Message Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// ======================
// Toggle Message Reaction
// ======================
export const toggleMessageReaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const messageId = Array.isArray(req.params.messageId)
      ? req.params.messageId[0]
      : req.params.messageId;
    const emoji = typeof req.body.emoji === "string" ? req.body.emoji.trim() : "";
    const userId = req.user!.id;

    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
      res.status(400).json({ success: false, message: "Invalid messageId" });
      return;
    }

    if (!emoji || emoji.length > 32) {
      res.status(400).json({ success: false, message: "A valid emoji is required" });
      return;
    }

    const message = await Message.findById(messageId);
    if (!message) {
      res.status(404).json({ success: false, message: "Message not found" });
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const reactionIndex = message.reactions.findIndex((r) => r.emoji === emoji);

    if (reactionIndex > -1) {
      const userIndex = message.reactions[reactionIndex].users.findIndex(
        (u) => u.toString() === userId
      );

      if (userIndex > -1) {
        // User already reacted: remove user
        message.reactions[reactionIndex].users.splice(userIndex, 1);
        // If no users left for this emoji, remove the emoji reaction completely
        if (message.reactions[reactionIndex].users.length === 0) {
          message.reactions.splice(reactionIndex, 1);
        }
      } else {
        // User hasn't reacted: add user
        message.reactions[reactionIndex].users.push(userObjectId);
      }
    } else {
      // Emoji reaction doesn't exist: create new one
      message.reactions.push({
        emoji,
        users: [userObjectId],
      });
    }

    await message.save();

    const formatted = formatMessageResponse(message);
    io.to(message.channel.toString()).emit("chat:reaction", {
      messageId: formatted.id,
      reactions: formatted.reactions,
    });

    res.status(200).json({
      success: true,
      message: "Message reaction updated successfully",
      data: formatted,
    });
  } catch (error) {
    console.error("Toggle Message Reaction Error:", error instanceof Error ? error.stack : error);
    res.status(500).json({ success: false, message: "Unable to update message reaction" });
  }
};

// ======================
// Delete Message
// ======================
export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const message = await Message.findById(id);

    if (!message) {
      res.status(404).json({
        success: false,
        message: "Message not found",
      });
      return;
    }

    if (message.sender.toString() !== userId) {
      res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
      return;
    }

    if (message.attachments?.length) {
      removeAttachmentFiles(message.attachments);
    }

    await message.deleteOne();

    res.status(200).json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Delete Message Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
