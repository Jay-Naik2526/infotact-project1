import { Request, Response } from 'express';
import Channels from '../models/Channels';
import Workspace from '../models/Workspace';
import formatChannelName from '../utils/formatChannelName';
import { io } from '../socket/socketServer';

import { notifyWorkspaceMembers } from '../services/notification.service';


// ======================
// Create Channel
// ======================
export const createChannel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, workspaceId } = req.body;
    const userId = req.user!.id;

    if (!name || !workspaceId) {
      res.status(400).json({
        success: false,
        message: 'Name and workspaceId are required',
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

    // Check if user is a workspace member
    const isMember = workspace.members.some(
      (member) => member.toString() === userId
    );
    
    if (!isMember) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: You are not a member of this workspace',
      });
      return;
    }

    const formattedName = formatChannelName(name);
    const existingChannel = await Channels.findOne({
      workspace: workspaceId,
      name: formattedName,
    });

    if (existingChannel) {
      res.status(409).json({
        success: false,
        message: 'Channel with this name already exists in the workspace',
      });
      return;
    }

    const channel = await Channels.create({
      name: formattedName,
      workspace: workspaceId,
      createdBy: userId,
    });

  // Push channel ID to workspace's channels array
    workspace.channels.push(channel._id as any);
    await workspace.save();

    io.to(workspaceId).emit('channel:created', {
      workspaceId,
      channel,
    });

    res.status(201).json({
      success: true,
      message: 'Channel created successfully',
      data: channel,
    });
  } catch (error) {
    console.error('Create Channel Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};

// ======================
// Get Channels
// ======================
export const getChannels = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspaceId = req.query.workspaceId as string;
    const userId = req.user!.id;

    if (!workspaceId) {
      res.status(400).json({
        success: false,
        message: 'workspaceId is required',
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

    // Check if user is a workspace member
    const isMember = workspace.members.some(
      (member) => member.toString() === userId
    );
    
    if (!isMember) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: You are not a member of this workspace',
      });
      return;
    }

    const channels = await Channels.find({
      workspace: workspaceId,
    })
      .populate('createdBy', 'name email')
      .sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      count: channels.length,
      data: channels,
    });
  } catch (error) {
    console.error('Get Channels Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};

// ======================
// Get Channel By ID
// ======================
export const getChannelById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const channel = await Channels.findById(id)
      .populate('createdBy', 'name email')
      .populate('workspace', 'name');

    if (!channel) {
      res.status(404).json({
        success: false,
        message: 'Channel not found',
      });
      return;
    }

    // Check if user is a workspace member
    const workspace = await Workspace.findById(channel.workspace);
    if (!workspace) {
      res.status(404).json({
        success: false,
        message: 'Workspace not found',
      });
      return;
    }

    const isMember = workspace.members.some(
      (member) => member.toString() === userId
    );
    
    if (!isMember) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: You are not a member of this workspace',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: channel,
    });
  } catch (error) {
    console.error('Get Channel Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
    });
  }
};

export const deleteChannel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const channel = await Channels.findById(id);
    if (!channel) { res.status(404).json({ success: false, message: 'Channel not found' }); return; }
    const workspace = await Workspace.findById(channel.workspace);
    if (!workspace) { res.status(404).json({ success: false, message: 'Workspace not found' }); return; }
    if (workspace.createdBy.toString() !== req.user!.id) { res.status(403).json({ success: false, message: 'Only the workspace owner can delete channels' }); return; }

    await Channels.deleteOne({ _id: channel._id });
    await Workspace.updateOne({ _id: workspace._id }, { $pull: { channels: channel._id } });
    if (io) io.to(workspace._id.toString()).emit('channel:deleted', { workspaceId: workspace._id.toString(), channelId: channel._id.toString() });
    await notifyWorkspaceMembers(workspace.members, {
      actor: req.user!.id,
      type: 'channel:deleted',
      title: 'Channel deleted',
      body: `#${channel.name} was deleted from ${workspace.name}.`,
      workspace: workspace._id,
    });
    res.status(200).json({ success: true, message: 'Channel deleted successfully' });
  } catch (error) {
    console.error('Delete Channel Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};
