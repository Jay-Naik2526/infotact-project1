import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { IWorkspace, IChannel } from '../types/index.ts';
import api from '../services/api.ts';
import { useAuth } from '../hooks/useAuth.ts';
import { socket } from '../services/socket.ts';
import { useToast } from '../components/ui/ToastProvider.tsx';

export interface WorkspaceContextType {
  activeWorkspace: IWorkspace | null;
  activeChannel: IChannel | null;
  workspaces: IWorkspace[];
  setActiveWorkspace: (workspace: IWorkspace) => void;
  setActiveChannel: (channel: IChannel) => void;
  fetchWorkspaces: () => Promise<void>;
  updateWorkspace: (workspace: IWorkspace) => void;
  removeWorkspace: (workspaceId: string) => void;
  addChannelToWorkspace: (workspaceId: string, channel: IChannel) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<IWorkspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<IWorkspace | null>(null);
  const [activeChannel, setActiveChannelState] = useState<IChannel | null>(null);
  const { isAuthenticated, user } = useAuth();
  const { showToast } = useToast();

  const { workspaceId, channelId } = useParams<{ workspaceId: string; channelId: string }>();
  const navigate = useNavigate();

  const getId = (item: any) => {
    if (typeof item === "string") return item;
    return String(item?.id || item?._id || "");
  };

  const normalizeChannel = (channel: any): IChannel => ({
    ...channel,
    id: getId(channel),
    workspaceId:
      channel?.workspaceId ||
      channel?.workspace?.id ||
      channel?.workspace?._id ||
      channel?.workspace ||
      "",
  });

  const normalizeWorkspace = (workspace: any): IWorkspace => ({
    ...workspace,
    id: getId(workspace),
    ownerId:
      workspace?.ownerId ||
      workspace?.createdBy?.id ||
      workspace?.createdBy?._id ||
      workspace?.createdBy ||
      "",
    channels: ((workspace?.channels || []) as any[]).map((channel) =>
      typeof channel === "object" ? normalizeChannel(channel) : channel
    ),
    members: workspace?.members || [],
  });

  const getWorkspaceChannels = (workspace: IWorkspace | null) =>
    (((workspace?.channels || []) as any[]).filter(
      (c) => c && typeof c === "object" && "name" in c
    ) as IChannel[]);
  
  const fetchWorkspaces = async () => {
  try {
    const response = await api.get("/workspaces");

    const rawData = response.data;
    const workspacesList = (Array.isArray(rawData)
      ? rawData
      : rawData?.data || []).map(normalizeWorkspace);

    setWorkspaces(workspacesList);

    if (workspacesList.length > 0) {
      let targetWorkspace =
        workspacesList.find((w: any) => w.id === workspaceId) ||
        workspacesList[0];

      setActiveWorkspaceState(targetWorkspace);

      const workspaceChannels = getWorkspaceChannels(targetWorkspace);

      let targetChannel =
        workspaceChannels.find((c: any) => c.id === channelId) ||
        workspaceChannels[0];

      if (targetChannel) {
        setActiveChannelState(targetChannel);
      }

      if (
        targetWorkspace &&
        targetChannel &&
        targetWorkspace.id &&
        targetChannel.id &&
        (workspaceId === "default" ||
          channelId === "general" ||
          workspaceId !== targetWorkspace.id ||
          channelId !== targetChannel.id)
      ) {
        navigate(`/app/${targetWorkspace.id}/${targetChannel.id}`, {
          replace: true,
        });
      }
    }
  } catch (error) {
    console.error("Failed to fetch workspaces:", error);
  }
};

  const setActiveWorkspace = (workspace: IWorkspace) => {
    const normalizedWorkspace = normalizeWorkspace(workspace);
    setActiveWorkspaceState(normalizedWorkspace);
    
    const workspaceChannels = getWorkspaceChannels(normalizedWorkspace);

    const firstChannel = workspaceChannels.length > 0 ? workspaceChannels[0] : null;
    if (firstChannel) {
      firstChannel.unreadCount = 0;
    }
    setActiveChannelState(firstChannel);
    
    // Clear unread count for this workspace and channel in workspaces list
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (ws.id !== normalizedWorkspace.id) return ws;
        return {
          ...ws,
          unreadCount: 0,
          channels: ws.channels.map((ch) => {
            if (typeof ch === "object" && firstChannel && ch.id === firstChannel.id) {
              return { ...ch, unreadCount: 0 };
            }
            return ch;
          }),
        };
      })
    );
    
    if (normalizedWorkspace.id && firstChannel?.id) {
      navigate(`/app/${normalizedWorkspace.id}/${firstChannel.id}`);
    } else if (normalizedWorkspace.id) {
      navigate(`/app/${normalizedWorkspace.id}/no-channel`);
    }
  };

  const setActiveChannel = (channel: IChannel) => {
    const normalizedChannel = normalizeChannel(channel);
    
    // Clear unread count for this channel
    if (activeWorkspace?.id) {
      setWorkspaces((prev) =>
        prev.map((ws) => {
          if (ws.id !== activeWorkspace.id) return ws;
          return {
            ...ws,
            channels: ws.channels.map((ch) => {
              if (typeof ch === "object" && ch.id === normalizedChannel.id) {
                return { ...ch, unreadCount: 0 };
              }
              return ch;
            }),
          };
        })
      );
      
      setActiveWorkspaceState((current) => {
        if (!current) return current;
        return {
          ...current,
          channels: current.channels.map((ch) => {
            if (typeof ch === "object" && ch.id === normalizedChannel.id) {
              return { ...ch, unreadCount: 0 };
            }
            return ch;
          }),
        };
      });
    }

    setActiveChannelState(normalizedChannel);
    if (activeWorkspace?.id && normalizedChannel.id) {
      navigate(`/app/${activeWorkspace.id}/${normalizedChannel.id}`);
    }
  };
  const updateWorkspace = (updatedWorkspace: IWorkspace) => {
  const normalizedWorkspace = normalizeWorkspace(updatedWorkspace);

  setWorkspaces((prev) =>
    prev.map((ws) =>
      ws.id === normalizedWorkspace.id ? normalizedWorkspace : ws
    )
  );

  setActiveWorkspaceState(normalizedWorkspace);
};

  const removeWorkspace = (workspaceId: string) => {
    setWorkspaces((previous) => previous.filter((workspace) => workspace.id !== workspaceId));
    setActiveWorkspaceState((current) => {
      if (current?.id !== workspaceId) return current;
      setActiveChannelState(null);
      navigate('/app/default/general', { replace: true });
      return null;
    });
  };

  const addChannelToWorkspace = (workspaceId: string, channel: IChannel) => {
    const nextChannel = normalizeChannel(channel);
    const normalizedChannel = {
      ...nextChannel,
      workspaceId: nextChannel.workspaceId || workspaceId,
    };

    if (!workspaceId || !normalizedChannel.id) return;

    setWorkspaces((prev) =>
      prev.map((workspace) => {
        if (workspace.id !== workspaceId) return workspace;

        const channels = getWorkspaceChannels(workspace);
        const nextChannels = channels.some((item) => item.id === normalizedChannel.id)
          ? channels
          : [...channels, normalizedChannel];

        return {
          ...workspace,
          channels: nextChannels,
        };
      })
    );

    setActiveWorkspaceState((current) => {
      if (!current || current.id !== workspaceId) return current;
      const channels = getWorkspaceChannels(current);
      const nextChannels = channels.some((item) => item.id === normalizedChannel.id)
        ? channels
        : [...channels, normalizedChannel];
      return {
        ...current,
        channels: nextChannels,
      };
    });

    setActiveChannelState(normalizedChannel);
    if (workspaceId && normalizedChannel.id) {
      navigate(`/app/${workspaceId}/${normalizedChannel.id}`);
    }
  };

  // On mount: fetch workspaces if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchWorkspaces();
    } else {
      setWorkspaces([]);
      setActiveWorkspaceState(null);
      setActiveChannelState(null);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Membership events can arrive through the workspace room or the user's
    // private room. Refetching keeps workspace and member data consistent.
    const refreshForMembershipChange = () => { void fetchWorkspaces(); };
    socket.on('workspace:member-added', refreshForMembershipChange);
    socket.on('workspace:member-left', refreshForMembershipChange);
    socket.on('workspace:member-removed', refreshForMembershipChange);
    socket.on('channel:created', refreshForMembershipChange);
    socket.on('channel:deleted', refreshForMembershipChange);
    return () => {
      socket.off('workspace:member-added', refreshForMembershipChange);
      socket.off('workspace:member-left', refreshForMembershipChange);
      socket.off('workspace:member-removed', refreshForMembershipChange);
      socket.off('channel:created', refreshForMembershipChange);
      socket.off('channel:deleted', refreshForMembershipChange);
    };
  }, [isAuthenticated]);

  // Sync state if URL changes (like browser back/forward buttons)
  useEffect(() => {
    if (workspaces.length === 0) return;

    const matchedWorkspace = workspaces.find((w) => w.id === workspaceId);
    if (matchedWorkspace && matchedWorkspace.id !== activeWorkspace?.id) {
      setActiveWorkspaceState(matchedWorkspace);

      const workspaceChannels = getWorkspaceChannels(matchedWorkspace);

      const matchedChannel = workspaceChannels.find((c) => c.id === channelId) || workspaceChannels[0] || null;
      if (matchedChannel) {
        matchedChannel.unreadCount = 0;
      }
      setActiveChannelState(matchedChannel);
    } else if (activeWorkspace) {
      const workspaceChannels = getWorkspaceChannels(activeWorkspace);

      const matchedChannel = workspaceChannels.find((c) => c.id === channelId);
      if (matchedChannel && matchedChannel.id !== activeChannel?.id) {
        matchedChannel.unreadCount = 0;
        setActiveChannelState(matchedChannel);
      }
    }
  }, [workspaceId, channelId, workspaces]);

  // Keep references to active state for socket listeners
  const activeWorkspaceRef = useRef<IWorkspace | null>(null);
  const activeChannelRef = useRef<IChannel | null>(null);
  const workspacesRef = useRef<IWorkspace[]>([]);

  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace;
  }, [activeWorkspace]);

  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);

  // Join workspace rooms on socket connection
  useEffect(() => {
    if (!isAuthenticated || workspaces.length === 0) return;

    const joinWorkspaceRooms = () => {
      workspaces.forEach((ws) => {
        socket.emit("workspace:join", { workspaceId: ws.id });
      });
      if (user?.id) {
        socket.emit("workspace:join", { workspaceId: user.id }); // join user personal room
      }
    };

    if (socket.connected) {
      joinWorkspaceRooms();
    }

    socket.on("connect", joinWorkspaceRooms);
    return () => {
      socket.off("connect", joinWorkspaceRooms);
    };
  }, [isAuthenticated, workspaces.length, user?.id]);

  // Real-time socket event listeners
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleWorkspaceAdded = (payload: { workspace: any }) => {
      if (payload.workspace) {
        const nextWorkspace = normalizeWorkspace(payload.workspace);
        setWorkspaces((prev) => {
          if (prev.some((w) => w.id === nextWorkspace.id)) return prev;
          return [nextWorkspace, ...prev];
        });
        showToast(`You have been added to workspace: ${nextWorkspace.name}`, "info");
        socket.emit("workspace:join", { workspaceId: nextWorkspace.id });
      }
    };

    const handleChannelCreated = (payload: { workspaceId: string; channel: any }) => {
      const { workspaceId, channel } = payload;
      if (!workspaceId || !channel) return;
      const normalizedChannel = normalizeChannel(channel);

      setWorkspaces((prev) =>
        prev.map((ws) => {
          if (ws.id !== workspaceId) return ws;
          const channelsList = getWorkspaceChannels(ws);
          if (channelsList.some((c) => c.id === normalizedChannel.id)) return ws;
          return {
            ...ws,
            channels: [...(ws.channels as any[]), normalizedChannel],
          };
        })
      );

      setActiveWorkspaceState((current) => {
        if (!current || current.id !== workspaceId) return current;
        const channelsList = getWorkspaceChannels(current);
        if (channelsList.some((c) => c.id === normalizedChannel.id)) return current;
        return {
          ...current,
          channels: [...(current.channels as any[]), normalizedChannel],
        };
      });

      if (activeWorkspaceRef.current?.id === workspaceId) {
        showToast(`New channel created: #${normalizedChannel.name}`, "info");
      }
    };

    const handleWorkspaceMessage = (payload: { workspaceId: string; channelId: string; message: any }) => {
      const { workspaceId, channelId, message } = payload;
      if (!workspaceId || !channelId || !message) return;

      // Ignore messages sent by oneself
      if (message.senderId === user?.id) return;

      // Ignore if viewing this channel right now
      if (
        workspaceId === activeWorkspaceRef.current?.id &&
        channelId === activeChannelRef.current?.id
      ) {
        return;
      }

      // Update unread count
      setWorkspaces((prev) =>
        prev.map((ws) => {
          if (ws.id !== workspaceId) return ws;
          return {
            ...ws,
            unreadCount: (ws.unreadCount || 0) + 1,
            channels: ws.channels.map((ch) => {
              if (typeof ch === "object" && ch.id === channelId) {
                return {
                  ...ch,
                  unreadCount: (ch.unreadCount || 0) + 1,
                };
              }
              return ch;
            }),
          };
        })
      );

      setActiveWorkspaceState((current) => {
        if (!current || current.id !== workspaceId) return current;
        return {
          ...current,
          channels: current.channels.map((ch) => {
            if (typeof ch === "object" && ch.id === channelId) {
              return {
                ...ch,
                unreadCount: (ch.unreadCount || 0) + 1,
              };
            }
            return ch;
          }),
        };
      });

      // Show Toast Notification
      const ws = workspacesRef.current.find((w) => w.id === workspaceId);
      const chList = ws ? getWorkspaceChannels(ws) : [];
      const ch = chList.find((c) => c.id === channelId);

      const wsName = ws?.name || "Workspace";
      const chName = ch?.name || "channel";

      showToast(
        `[${wsName} > #${chName}] ${message.senderName}: "${message.content.slice(0, 45)}${message.content.length > 45 ? "..." : ""}"`,
        "info"
      );
    };

    socket.on("workspace:added", handleWorkspaceAdded);
    socket.on("channel:created", handleChannelCreated);
    socket.on("workspace:message", handleWorkspaceMessage);

    return () => {
      socket.off("workspace:added", handleWorkspaceAdded);
      socket.off("channel:created", handleChannelCreated);
      socket.off("workspace:message", handleWorkspaceMessage);
    };
  }, [isAuthenticated, user?.id]);

  return (
    <WorkspaceContext.Provider
    value={{
      activeWorkspace,
      activeChannel,
      workspaces,
      setActiveWorkspace,
      setActiveChannel,
      fetchWorkspaces,
      updateWorkspace,
      removeWorkspace,
      addChannelToWorkspace,
    }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspaceContext = () => {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspaceContext must be used within a WorkspaceProvider');
  }
  return context;
};
