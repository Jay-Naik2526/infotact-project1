import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import connectDB from '../config/db';
import User from '../models/User';
import Workspace from '../models/Workspace';
import Channels from '../models/Channels';
import Message from '../models/Message';

// Load environment variables
dotenv.config();

const seed = async () => {
  console.log('Starting database seeding...');

  // Ensure database connection
  await connectDB();

  // If MONGO_URI is not defined, we cannot seed a real MongoDB database.
  if (!process.env.MONGO_URI) {
    console.error('ERROR: MONGO_URI env variable is missing. Cannot seed real database.');
    process.exit(1);
  }

  try {
    // 1. Clear existing database collections
    console.log('Clearing existing data...');
    try { await User.collection.drop(); } catch (e) {}
    try { await Workspace.collection.drop(); } catch (e) {}
    try { await Channels.collection.drop(); } catch (e) {}
    try { await Message.collection.drop(); } catch (e) {}
    console.log('Existing database collections dropped successfully.');

    // 2. Generate hashed password
    const saltRounds = 10;
    const password = await bcrypt.hash('password123', saltRounds);

    // 3. Create 3 test users (1 admin, 2 members)
    console.log('Creating users...');
    const adminUser = await User.create({
      name: 'System Admin',
      email: 'admin@slackclone.com',
      password,
    });

    const member1 = await User.create({
      name: 'Jay Naik',
      email: 'jay@infotact.com',
      password,
    });

    const member2 = await User.create({
      name: 'Dinesh Kumar',
      email: 'dinesh@infotact.com',
      password,
    });

    console.log(`Created users: ${adminUser.email}, ${member1.email}, ${member2.email}`);

    // 4. Create 2 workspaces
    console.log('Creating workspaces...');
    const workspace1 = await Workspace.create({
      name: 'Infotact Engineering',
      description: 'Primary workspace for the engineering team.',
      createdBy: adminUser._id,
      members: [adminUser._id, member1._id, member2._id],
      channels: [],
    });

    const workspace2 = await Workspace.create({
      name: 'Infotact Marketing',
      description: 'Primary workspace for marketing campaigns.',
      createdBy: adminUser._id,
      members: [adminUser._id, member1._id],
      channels: [],
    });

    console.log(`Created workspaces: ${workspace1.name}, ${workspace2.name}`);

    // 5. Create 5 channels
    console.log('Creating channels...');
    // Workspace 1 channels
    const w1ChannelGeneral = await Channels.create({
      name: 'general',
      workspace: workspace1._id,
      createdBy: adminUser._id,
    });

    const w1ChannelDev = await Channels.create({
      name: 'development',
      workspace: workspace1._id,
      createdBy: member1._id,
    });

    const w1ChannelRandom = await Channels.create({
      name: 'random',
      workspace: workspace1._id,
      createdBy: member2._id,
    });

    // Workspace 2 channels
    const w2ChannelGeneral = await Channels.create({
      name: 'general',
      workspace: workspace2._id,
      createdBy: adminUser._id,
    });

    const w2ChannelSocial = await Channels.create({
      name: 'social-media',
      workspace: workspace2._id,
      createdBy: member1._id,
    });

    // Link channels to workspaces
    workspace1.channels = [w1ChannelGeneral._id, w1ChannelDev._id, w1ChannelRandom._id] as mongoose.Types.ObjectId[];
    await workspace1.save();

    workspace2.channels = [w2ChannelGeneral._id, w2ChannelSocial._id] as mongoose.Types.ObjectId[];
    await workspace2.save();

    console.log('Created channels and updated workspaces.');

    // 6. Create 20 messages (spread across channels)
    console.log('Creating sample messages...');
    const messageData = [
      // Workspace 1 - General (6 messages)
      { content: 'Welcome to the Infotact Engineering workspace!', sender: adminUser._id, channel: w1ChannelGeneral._id },
      { content: 'Glad to be here! Setting up my development workspace today.', sender: member1._id, channel: w1ChannelGeneral._id },
      { content: 'Welcome, Jay! Let me know if you need any configuration files.', sender: member2._id, channel: w1ChannelGeneral._id },
      { content: 'All setup! Real-time workspace features are running beautifully.', sender: member1._id, channel: w1ChannelGeneral._id },
      { content: 'Has anyone seen the design updates for the user avatar?', sender: member2._id, channel: w1ChannelGeneral._id },
      { content: "Yes! They've been integrated, build is passing cleanly.", sender: adminUser._id, channel: w1ChannelGeneral._id },

      // Workspace 1 - Development (6 messages)
      { content: 'This channel is for our engineering team updates.', sender: member1._id, channel: w1ChannelDev._id },
      { content: 'Socket.IO adapter integration with Redis client is running.', sender: member1._id, channel: w1ChannelDev._id },
      { content: 'Perfect, I will pull the changes and verify the message logs.', sender: member2._id, channel: w1ChannelDev._id },
      { content: 'Make sure node_modules are deleted and fresh install is done if you see lock conflicts.', sender: adminUser._id, channel: w1ChannelDev._id },
      { content: 'Will do. Also Docker multi-stage configurations look optimized.', sender: member2._id, channel: w1ChannelDev._id },
      { content: 'Yes, final image size is under 200MB! 🚀', sender: member1._id, channel: w1ChannelDev._id },

      // Workspace 1 - Random (4 messages)
      { content: 'Check out this website for UI design inspiration.', sender: member2._id, channel: w1ChannelRandom._id },
      { content: 'Very neat layouts. Loving the dark mode theme.', sender: member1._id, channel: w1ChannelRandom._id },
      { content: 'Has anyone tried the new coffee shop near the office?', sender: member2._id, channel: w1ChannelRandom._id },
      { content: 'It is amazing, highly recommend the cold brew.', sender: adminUser._id, channel: w1ChannelRandom._id },

      // Workspace 2 - General (2 messages)
      { content: 'Welcome to Infotact Marketing general discussions.', sender: adminUser._id, channel: w2ChannelGeneral._id },
      { content: 'Hello everyone! Excited to coordinate new campaigns.', sender: member1._id, channel: w2ChannelGeneral._id },

      // Workspace 2 - Social Media (2 messages)
      { content: 'Drafts for the next week announcements are in the shared document.', sender: member1._id, channel: w2ChannelSocial._id },
      { content: 'Reviewed. Looks perfect, let us publish them on Monday.', sender: adminUser._id, channel: w2ChannelSocial._id },
    ];

    for (const msg of messageData) {
      await Message.create(msg);
    }

    console.log(`Successfully created ${messageData.length} messages.`);
    console.log('Seeding completed successfully! 🎉');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seed();
