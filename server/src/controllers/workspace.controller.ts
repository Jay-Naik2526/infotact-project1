import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Workspace from '../models/Workspace';
import User from '../models/User';
import Channels from '../models/Channels';
import Message from '../models/Message';
import { io } from '../socket/socketServer';
import { createNotification, notifyWorkspaceMembers } from '../services/notification.service';

const uploadsDir = path.join(__dirname, '../../uploads');

const removeWorkspaceAttachments = async (channelIds: string[]): Promise<void> => {
  const messages = await Message.find({ channel: { $in: channelIds } }).select('attachments');

  for (const message of messages) {
    for (const attachment of message.attachments || []) {
      const filePath = path.join(uploadsDir, attachment.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
};

const disconnectUserFromWorkspaceRoom = async (workspaceId: string, userId: string): Promise<void> => {
  const sockets = await io.in(workspaceId).fetchSockets();
  await Promise.all(
    sockets
      .filter((socket) => socket.data.userId === userId)
      .map((socket) => socket.leave(workspaceId))
  );
};

const getClientInviteLink = (token: string) => {
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${clientUrl}/invite/${token}`;
};

const getPrimaryChannelId = (channels: any[] = []) => {
  const generalChannel = channels.find((channel: any) => channel?.name === 'general');
  const channel = generalChannel || channels[0];
  return channel?._id?.toString?.() || channel?.id?.toString?.() || channel?.toString?.() || '';
};

// ======================
// Create Workspace
// ======================
export const createWorkspace = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;
    const userId = req.user!.id;

    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedDescription = typeof description === 'string' ? description.trim() : '';

    if (!normalizedName) {
      res.status(400).json({
        success: false,
        message: 'Workspace name is required',
      });
      return;
    }

    if (normalizedName.length > 50 || normalizedDescription.length > 300) {
      res.status(400).json({
        success: false,
        message: 'Workspace name must be 50 characters or fewer and description 300 characters or fewer',
      });
      return;
    }

    const workspace = await Workspace.create({
      name: normalizedName,
      description: normalizedDescription,
      createdBy: userId,
      members: [userId],
    });
    await User.findByIdAndUpdate(userId, { $addToSet: { workspaces: workspace._id } });

    res.status(201).json({
      success: true,
      message: 'Workspace created successfully',
      data: workspace,
    });
  } catch (error) {
    console.error('Create Workspace Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};

// ======================
// Get All Workspaces
// ======================
export const getWorkspaces = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const workspaces = await Workspace.find({
      members: { $in: [userId] },
    })
      .populate('createdBy', 'name email')
      .populate('members', 'name email')
      .populate('channels')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: workspaces.length,
      data: workspaces,
    });
  } catch (error) {
    console.error('Get Workspaces Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};

// ======================
// Get Workspace By ID
// ======================
export const getWorkspaceById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const workspace = await Workspace.findById(id)
      .populate('createdBy', 'name email')
      .populate('members', 'name email')
      .populate('channels');

    if (!workspace) {
      res.status(404).json({
        success: false,
        message: 'Workspace not found',
      });
      return;
    }

    // Check if user is a member
    if (!workspace.members.some((m: any) => m._id.toString() === userId)) {
      res.status(403).json({
        success: false,
        message: 'You are not a member of this workspace',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: workspace,
    });
  } catch (error) {
    console.error('Get Workspace Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};

// ======================
// Update Workspace
// ======================
export const updateWorkspace = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const userId = req.user!.id;

    const workspace = await Workspace.findById(id);

    if (!workspace) {
      res.status(404).json({
        success: false,
        message: 'Workspace not found',
      });
      return;
    }

    // Check if user is the creator
    if (workspace.createdBy.toString() !== userId) {
      res.status(403).json({
        success: false,
        message: 'Only workspace creator can update',
      });
      return;
    }

    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedDescription = typeof description === 'string' ? description.trim() : '';

    if (!normalizedName) {
      res.status(400).json({ success: false, message: 'Workspace name is required' });
      return;
    }

    if (normalizedName.length > 50 || normalizedDescription.length > 300) {
      res.status(400).json({
        success: false,
        message: 'Workspace name must be 50 characters or fewer and description 300 characters or fewer',
      });
      return;
    }

    workspace.name = normalizedName;
    workspace.description = normalizedDescription;

    await workspace.save();

    io.to(workspace._id.toString()).emit('workspace:updated', {
      workspaceId: workspace._id.toString(),
      workspace,
    });

    res.status(200).json({
      success: true,
      message: 'Workspace updated successfully',
      data: workspace,
    });
  } catch (error) {
    console.error('Update Workspace Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};

// ======================
// Delete Workspace
// ======================
export const deleteWorkspace = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const workspace = await Workspace.findById(id);

    if (!workspace) {
      res.status(404).json({
        success: false,
        message: 'Workspace not found',
      });
      return;
    }

    // Check if user is the creator
    if (workspace.createdBy.toString() !== userId) {
      res.status(403).json({
        success: false,
        message: 'Only workspace creator can delete',
      });
      return;
    }

    const channelDocuments = await Channels.find({ workspace: workspace._id }).select('_id');
    const channelIds = channelDocuments.map((channel) => channel._id.toString());

    await removeWorkspaceAttachments(channelIds);
    await Message.deleteMany({ channel: { $in: channelIds } });
    await Channels.deleteMany({ workspace: workspace._id });
    await User.updateMany({ workspaces: workspace._id }, { $pull: { workspaces: workspace._id } });
    await workspace.deleteOne();

    io.to(workspace._id.toString()).emit('workspace:deleted', {
      workspaceId: workspace._id.toString(),
    });

    res.status(200).json({
      success: true,
      message: 'Workspace deleted successfully',
    });
  } catch (error) {
    console.error('Delete Workspace Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};

// ======================
// Leave Workspace
// ======================
export const leaveWorkspace = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const workspace = await Workspace.findById(id);

    if (!workspace) {
      res.status(404).json({ success: false, message: 'Workspace not found' });
      return;
    }

    if (workspace.createdBy.toString() === userId) {
      res.status(400).json({
        success: false,
        message: 'Transfer workspace ownership before leaving',
      });
      return;
    }

    const isMember = workspace.members.some((member) => member.toString() === userId);
    if (!isMember) {
      res.status(404).json({ success: false, message: 'You are not a workspace member' });
      return;
    }

    workspace.members = workspace.members.filter((member) => member.toString() !== userId);
    await Promise.all([
      workspace.save(),
      User.findByIdAndUpdate(userId, { $pull: { workspaces: workspace._id } }),
    ]);

    try {
      io.to(workspace._id.toString()).emit('workspace:member-left', {
        workspaceId: workspace._id.toString(),
        memberId: userId,
      });
      await disconnectUserFromWorkspaceRoom(workspace._id.toString(), userId);
    } catch (socketError) {
      console.error('Leave Workspace Socket Error:', socketError instanceof Error ? socketError.stack : socketError);
    }

    res.status(200).json({ success: true, message: 'Left workspace successfully' });
  } catch (error) {
    console.error('Leave Workspace Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// ======================
// Remove Workspace Member
// ======================
export const removeMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { workspaceId, memberId } = req.params;
    const currentUserId = req.user!.id;
    const workspace = await Workspace.findById(workspaceId);

    if (!workspace) {
      res.status(404).json({ success: false, message: 'Workspace not found' });
      return;
    }

    if (workspace.createdBy.toString() !== currentUserId) {
      res.status(403).json({ success: false, message: 'Only the workspace owner can remove members' });
      return;
    }

    if (workspace.createdBy.toString() === memberId) {
      res.status(400).json({ success: false, message: 'The workspace owner cannot be removed' });
      return;
    }

    const isMember = workspace.members.some((member) => member.toString() === memberId);
    if (!isMember) {
      res.status(404).json({ success: false, message: 'Member not found' });
      return;
    }

    workspace.members = workspace.members.filter((member) => member.toString() !== memberId);
    await Promise.all([
      workspace.save(),
      User.findByIdAndUpdate(memberId, { $pull: { workspaces: workspace._id } }),
    ]);

    io.to(workspace._id.toString()).emit('workspace:member-removed', {
      workspaceId: workspace._id.toString(),
      memberId,
    });

    res.status(200).json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove Member Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// ======================
// Generate Invite Link
// ======================
export const generateInviteLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const { workspaceId, refresh = false } = req.body;
    const userId = req.user!.id;

    if (!workspaceId) {
      res.status(400).json({
        success: false,
        message: 'Workspace ID is required',
      });
      return;
    }

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      res.status(404).json({
        success: false,
        message: 'Workspace not found',
      });
      return;
    }

    if (workspace.createdBy.toString() !== userId) {
      res.status(403).json({
        success: false,
        message: 'Only the workspace owner can create invite links',
      });
      return;
    }

    if (!workspace.inviteToken || refresh) {
      workspace.inviteToken = crypto.randomBytes(18).toString('hex');
      await workspace.save();
    }

    res.status(200).json({
      success: true,
      inviteToken: workspace.inviteToken,
      inviteLink: getClientInviteLink(workspace.inviteToken),
    });
  } catch (error) {
    console.error('Generate Invite Link Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};

// ======================
// Get Invite Workspace Preview
// ======================
export const getInviteWorkspace = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const userId = req.user!.id;

    const workspace = await Workspace.findOne({ inviteToken: token })
      .populate('createdBy', 'name email')
      .populate('channels', 'name')
      .select('name description createdBy members channels inviteToken');

    if (!workspace) {
      res.status(404).json({
        success: false,
        code: 'INVITE_INVALID',
        message: 'This invitation has expired or does not exist.',
      });
      return;
    }

    const channels = workspace.channels as any[];
    const members = workspace.members as any[];
    const owner = workspace.createdBy as any;
    const isMember = members.some((member: any) => member.toString() === userId);

    res.status(200).json({
      success: true,
      data: {
        workspaceId: workspace._id.toString(),
        name: workspace.name,
        description: workspace.description || '',
        owner: {
          id: owner?._id?.toString?.() || owner?.id || '',
          name: owner?.name || 'Workspace owner',
          email: owner?.email || '',
        },
        memberCount: members.length,
        channelCount: channels.length,
        generalChannelId: getPrimaryChannelId(channels),
        isMember,
      },
    });
  } catch (error) {
    console.error('Get Invite Workspace Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};

// ======================
// Join Workspace By Invite Token
// ======================
export const joinWorkspaceByInviteToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const userId = req.user!.id;

    const workspace = await Workspace.findOne({ inviteToken: token });

    if (!workspace) {
      res.status(404).json({
        success: false,
        code: 'INVITE_INVALID',
        message: 'This invitation has expired or does not exist.',
      });
      return;
    }

    const isMember = workspace.members.some((member: any) => member.toString() === userId);

    if (!isMember) {
      // $addToSet is idempotent and avoids duplicate members under concurrent joins.
      const updatedWorkspace = await Workspace.findByIdAndUpdate(
        workspace._id,
        { $addToSet: { members: userId } },
        { new: true }
      ).populate('members', 'name email');
      await User.findByIdAndUpdate(userId, { $addToSet: { workspaces: workspace._id } });
      const member = updatedWorkspace?.members.find((item: any) => (item._id?.toString?.() || item.toString()) === userId);
      const payload = {
        workspaceId: workspace._id.toString(),
        memberId: userId,
        member,
      };
      if (io) {
        io.to(workspace._id.toString()).emit('workspace:member-added', payload);
        io.to(`user:${userId}`).emit('workspace:member-added', payload);
      }
      const joiningUser = await User.findById(userId).select('name');
      await notifyWorkspaceMembers(workspace.members, {
        actor: userId,
        type: 'workspace:member-joined',
        title: 'New workspace member',
        body: `${joiningUser?.name || 'A user'} joined ${workspace.name}.`,
        workspace: workspace._id,
      });
    }

    await workspace.populate('channels', 'name');
    const channels = workspace.channels as any[];

    res.status(200).json({
      success: true,
      alreadyMember: isMember,
      message: isMember ? 'You are already a member' : 'Joined workspace successfully',
      data: {
        workspaceId: workspace._id.toString(),
        generalChannelId: getPrimaryChannelId(channels),
      },
    });
  } catch (error) {
    console.error('Join Workspace Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};

// ======================
// Get Workspace Members
// ======================
export const getWorkspaceMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const workspace = await Workspace.findById(id).populate(
      'members',
      'name email role isOnline'
    );

    if (!workspace) {
      res.status(404).json({
        success: false,
        message: 'Workspace not found',
      });
      return;
    }

    const isMember = workspace.members.some((member: any) => {
      const memberId = member._id?.toString?.() || member.toString();
      return memberId === userId;
    });

    if (!isMember) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: You are not a member of this workspace',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: workspace.members,
    });
  } catch (error) {
    console.error('Get Workspace Members Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};
// ======================
// Add Member to Workspace
// ======================
export const addMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    const currentUserId = req.user!.id;

    if (!email) {
      res.status(400).json({
        success: false,
        message: "Email is required",
      });
      return;
    }

    const workspace = await Workspace.findById(id);

    if (!workspace) {
      res.status(404).json({
        success: false,
        message: "Workspace not found",
      });
      return;
    }

    // Check if current user is creator
    if (workspace.createdBy.toString() !== currentUserId) {
      res.status(403).json({
        success: false,
        message: "Only workspace creator can add members",
      });
      return;
    }

    // Find user by email
    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const userId = user._id.toString();

    // Check if already a member
    if (workspace.members.some((m: any) => m.toString() === userId)) {
      res.status(400).json({
        success: false,
        message: "User is already a member",
      });
      return;
    }

    // Add member to workspace and workspace to user
    await Promise.all([
      Workspace.updateOne(
        { _id: workspace._id },
        { $addToSet: { members: user._id } }
      ),
      User.updateOne(
        { _id: user._id },
        { $addToSet: { workspaces: workspace._id } }
      ),
    ]);

    // Fetch member details
    const member = await User.findById(user._id).select("name email");

    const payload = {
      workspaceId: workspace._id.toString(),
      memberId: user._id.toString(),
      member,
    };

    // Socket Events
    if (io) {
      io.to(workspace._id.toString()).emit("workspace:member-added", payload);
      io.to(`user:${user._id.toString()}`).emit("workspace:member-added", payload);
    }

    // Create Notification
    await createNotification({
      recipient: user._id,
      actor: currentUserId,
      type: "workspace:invite",
      title: "Workspace Invitation",
      body: `You were added to ${workspace.name}.`,
      workspace: workspace._id,
    });

    res.status(200).json({
      success: true,
      message: "Member added successfully",
      data: payload,
    });

  } catch (error) {
    console.error("Add Member Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};