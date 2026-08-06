import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useWorkspace } from "../../hooks/useWorkspace.ts";
import type { IChannel } from "../../types/index.ts";

import CreateChannelModal from "./CreateChannelModal";
import CreateWorkspaceModal from "../workspace/CreateWorkspaceModal";
import WorkspaceSettingsModal from "../workspace/WorkspaceSettingsModal";
import InviteMemberModal from "../workspace/InviteMemberModal";
import { useAuth } from "../../hooks/useAuth.ts";
import { useToast } from "../ui/ToastProvider.tsx";
import api from "../../services/api.ts";
import { socket } from "../../services/socket.ts";
import {
  ChevronDown,
  Plus,
  Hash,
  Search,
  MoreHorizontal,
  Settings,
  Users,
  Link,
  Copy,
  LogOut,
  Trash2,
  X,
} from "lucide-react";
import {
  getWorkspaceChannelCount,
  getWorkspaceGradient,
  getWorkspaceInitials,
  getWorkspaceMemberCount,
} from "../../utils/workspaceVisuals.ts";

export const ChannelList: React.FC = () => {
  const [openChannelModal, setOpenChannelModal] = useState(false);
  const [openWorkspaceModal, setOpenWorkspaceModal] = useState(false);
  const [search, setSearch] = useState("");
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<"leave" | "delete" | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const { user } = useAuth();
  const { showToast } = useToast();

const {
  workspaces,
  activeWorkspace,
  activeChannel,
  setActiveWorkspace,
  setActiveChannel,
  updateWorkspace,
  removeWorkspace,
  fetchWorkspaces,
} = useWorkspace();

  const isOwner = activeWorkspace?.ownerId === user?.id;

  useEffect(() => {
    const handleWorkspaceUpdated = (payload: { workspaceId: string; workspace: typeof activeWorkspace }) => {
      if (payload.workspace && payload.workspaceId === activeWorkspace?.id) {
        updateWorkspace(payload.workspace);
      }
    };
    const handleWorkspaceDeleted = ({ workspaceId }: { workspaceId: string }) => removeWorkspace(workspaceId);
    const handleMemberRemoved = ({ workspaceId, memberId }: { workspaceId: string; memberId: string }) => {
      if (memberId === user?.id) removeWorkspace(workspaceId);
      else if (workspaceId === activeWorkspace?.id) void fetchWorkspaces();
    };
    const handleMemberAdded = ({ workspaceId }: { workspaceId: string }) => {
      if (workspaceId === activeWorkspace?.id) void fetchWorkspaces();
    };

    socket.on("workspace:updated", handleWorkspaceUpdated);
    socket.on("workspace:deleted", handleWorkspaceDeleted);
    socket.on("workspace:member-removed", handleMemberRemoved);
    socket.on("workspace:member-left", handleMemberRemoved);
    socket.on("workspace:member-added", handleMemberAdded);
    return () => {
      socket.off("workspace:updated", handleWorkspaceUpdated);
      socket.off("workspace:deleted", handleWorkspaceDeleted);
      socket.off("workspace:member-removed", handleMemberRemoved);
      socket.off("workspace:member-left", handleMemberRemoved);
      socket.off("workspace:member-added", handleMemberAdded);
    };
  }, [activeWorkspace?.id, fetchWorkspaces, removeWorkspace, updateWorkspace, user?.id]);

  const handleCopyInvite = async () => {
    if (!activeWorkspace || !isOwner) return;
    try {
      const response = await api.post<{ inviteLink: string }>("/workspaces/invite", { workspaceId: activeWorkspace.id });
      await navigator.clipboard.writeText(response.data.inviteLink);
      showToast("Invite link copied");
    } catch (error) {
      console.error("Copy invite link failed:", error);
      showToast("Could not copy invite link", "error");
    }
  };

  const handleWorkspaceAction = async () => {
    if (!activeWorkspace || !confirmation) return;
    if (confirmation === "delete" && confirmationText !== activeWorkspace.name) return;

    try {
      setActionLoading(true);
      if (confirmation === "delete") {
        await api.delete(`/workspaces/${activeWorkspace.id}`);
        removeWorkspace(activeWorkspace.id);
        showToast("Workspace deleted");
      } else {
        await api.post(`/workspaces/${activeWorkspace.id}/leave`);
        removeWorkspace(activeWorkspace.id);
        showToast("You left the workspace");
      }
      setConfirmation(null);
      setConfirmationText("");
    } catch (error) {
      console.error("Workspace action failed:", error);
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof error.response === "object" &&
        error.response !== null &&
        "data" in error.response &&
        typeof error.response.data === "object" &&
        error.response.data !== null &&
        "message" in error.response.data &&
        typeof error.response.data.message === "string"
          ? error.response.data.message
          : "Workspace action failed. Please try again.";
      showToast(message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const channels = (
    ((activeWorkspace?.channels || []) as any[]).filter(
      (chan) => chan && typeof chan === "object" && "name" in chan
    ) as IChannel[]
  ).filter((channel) =>
    channel.name.toLowerCase().includes(search.toLowerCase())
  );

  const activeWorkspaceGradient = getWorkspaceGradient(activeWorkspace?.id);
  const activeWorkspaceInitials = getWorkspaceInitials(activeWorkspace?.name);
  const activeMemberCount = getWorkspaceMemberCount(activeWorkspace);
  const activeChannelCount = getWorkspaceChannelCount(activeWorkspace);
  const activeDescription =
    ((activeWorkspace as any)?.description as string | undefined) ||
    "Team collaboration workspace";

  return (
<>
  <aside className="channel-sidebar flex h-dvh w-[288px] shrink-0 flex-col border-r border-[#23263A] bg-[#0B0B11] shadow-2xl shadow-black/20">

        {/* Workspace Header */}
      <div className="relative border-b border-[#23263A] p-6">
        <motion.button
          onClick={() => setWorkspaceMenuOpen((open) => !open)}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.99 }}
          className="group w-full rounded-2xl border border-[#23263A] bg-[#141621] p-4 text-left shadow-xl shadow-black/20 transition duration-200 hover:border-[#6D4AFF]/70 hover:shadow-[#8B5CF6]/10"
        >
          <div className="flex items-center gap-3">
            <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${activeWorkspaceGradient} text-sm font-black text-white shadow-lg shadow-[#8B5CF6]/20`}>
              {activeWorkspaceInitials}
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#141621] bg-emerald-400" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-bold text-white">
                  {activeWorkspace?.name || "Workspace"}
                </h2>
                <ChevronDown size={15} className="shrink-0 text-[#A1A1AA] transition group-hover:text-white" />
              </div>

              <p className="mt-1 truncate text-xs text-[#A1A1AA]">
                {activeDescription}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-[#23263A]/70 bg-[#0B0B11]/80 px-3 py-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA]">
                Members
              </p>
              <p className="text-sm font-bold text-white">{activeMemberCount}</p>
            </div>
            <div className="h-8 w-px bg-[#23263A]" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA]">
                Channels
              </p>
              <p className="text-sm font-bold text-white">{activeChannelCount}</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
              Online
            </span>
          </div>
        </motion.button>
        {activeWorkspace && (
          <button onClick={() => setWorkspaceMenuOpen((open) => !open)} className="absolute right-8 top-8 rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Open workspace menu">
            <MoreHorizontal size={18} />
          </button>
        )}
        {workspaceMenuOpen && activeWorkspace && (
          <div className="absolute right-6 top-[72px] z-40 w-60 rounded-2xl border border-white/10 bg-[#15151f]/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
            {isOwner && <button onClick={() => { setSettingsOpen(true); setWorkspaceMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/10"><Settings size={16} />Workspace settings</button>}
            <button onClick={() => { document.getElementById("members-panel")?.scrollIntoView({ behavior: "smooth" }); setWorkspaceMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/10"><Users size={16} />Manage members</button>
            {isOwner && <button onClick={() => { setInviteOpen(true); setWorkspaceMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/10"><Link size={16} />Invite people</button>}
            {isOwner && <button onClick={handleCopyInvite} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/10"><Copy size={16} />Copy invite link</button>}
            {!isOwner && <button onClick={() => { setConfirmation("leave"); setWorkspaceMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-amber-200 transition hover:bg-amber-500/10"><LogOut size={16} />Leave workspace</button>}
            {isOwner && <><div className="my-2 border-t border-white/10" /><button onClick={() => { setConfirmation("delete"); setWorkspaceMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-red-300 transition hover:bg-red-500/10"><Trash2 size={16} />Delete workspace</button></>}
          </div>
        )}
        </div>

        {/* Body */}
        <div className="app-scrollbar flex-1 overflow-y-auto px-5 py-5">

          {/* Search */}
          <div className="relative mb-6">

            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />

            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full rounded-2xl border border-[#23263A] bg-[#141621] pl-10 pr-3 text-sm text-white outline-none transition-all duration-200 placeholder:text-[#A1A1AA]/60 hover:border-[#6D4AFF]/50 focus:border-[#8B5CF6] focus:ring-4 focus:ring-[#8B5CF6]/15"
            />

          </div>

          {/* Channel Header */}

          <div className="mb-3 flex items-center justify-between px-1">

            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#A1A1AA]">
              Channels
            </span>

            <button
              onClick={() => setOpenChannelModal(true)}
              title="Create Channel"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[#A1A1AA] transition-all duration-200 hover:scale-105 hover:bg-[#8B5CF6]/10 hover:text-[#8B5CF6]"
            >
              <Plus size={15} />
            </button>

          </div>

          {/* Channel List */}

          <div className="space-y-1.5">

            {channels.length === 0 ? (

              <div className="mx-1 rounded-2xl border border-dashed border-[#23263A] bg-[#141621]/70 px-3 py-5 text-center text-xs text-[#A1A1AA]">
                {search
                  ? "No channels found"
                  : "No channels available"}
              </div>

            ) : (

              channels.map((channel) => {

                const isActive =
                  activeChannel?.id === channel.id;
                const unreadCount = Number((channel as any).unreadCount || 0);

                return (

                  <motion.button
                    key={channel.id}
                    onClick={() => setActiveChannel(channel)}
                    whileHover={{ x: 3, scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-200 ${
                        isActive
                          ? "border-[#6D4AFF] bg-[#6D4AFF]/20 text-white shadow-lg shadow-[#8B5CF6]/15"
                          : "border-transparent text-[#A1A1AA] hover:border-[#23263A] hover:bg-[#141621] hover:text-white"
                    }`}
                  >

                    <Hash
                      size={16}
                      className={`${
                        isActive
                          ? "text-white"
                          : "text-[#A1A1AA] group-hover:text-[#8B5CF6]"
                      }`}
                    />

                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {channel.name}
                    </span>

                    {!isActive && unreadCount > 0 && (
                      <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-lg shadow-red-500/20">
                        {unreadCount}
                      </span>
                    )}

                  </motion.button>

                );

              })

            )}

          </div>
  {/* Divider */}

<div className="my-6 border-t border-[#23263A]" />

{/* Workspace Section */}

<div>

  <div className="mb-4 flex items-start justify-between">

    <div>
      <h3 className="text-sm font-bold text-white">
        Workspaces
      </h3>
      <p className="mt-0.5 text-xs text-[#A1A1AA]">
        Switch between your teams
      </p>
    </div>

    <button
      onClick={() => setOpenWorkspaceModal(true)}
      className="rounded-xl p-2 text-[#A1A1AA] transition hover:scale-105 hover:bg-[#8B5CF6]/10 hover:text-[#8B5CF6]"
    >
      <Plus size={15} />
    </button>

  </div>

  <div className="space-y-3">

    {workspaces.map((workspace) => {

      const active =
        workspace.id === activeWorkspace?.id;
      const gradient = getWorkspaceGradient(workspace.id);
      const initials = getWorkspaceInitials(workspace.name);
      const memberCount = getWorkspaceMemberCount(workspace);

      return (

        <motion.button
          key={workspace.id}
          onClick={() => setActiveWorkspace(workspace)}
          whileHover={{ y: -2, scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-200 ${
              active
                ? "border-[#6D4AFF] bg-[#181A24] text-white shadow-lg shadow-[#8B5CF6]/20"
                : "border-[#23263A]/70 bg-[#141621]/60 text-[#A1A1AA] hover:border-[#6D4AFF]/50 hover:bg-[#181A24] hover:text-white"
          }`}
        >
<div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-xs font-black text-white shadow-lg shadow-black/20`}>
{initials}
</div>


          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">
              {workspace.name}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-[#A1A1AA]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {memberCount} members
            </span>
          </div>

        </motion.button>

      );

    })}

  </div>

</div>

        </div>

      </aside>

      <CreateChannelModal
      isOpen={openChannelModal}
      onClose={() => setOpenChannelModal(false)}
      />

      <CreateWorkspaceModal
      isOpen={openWorkspaceModal}
      onClose={() => setOpenWorkspaceModal(false)}
      />
      <WorkspaceSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <InviteMemberModal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} />
      {confirmation && activeWorkspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#15151f] p-6 shadow-2xl shadow-black/60">
            <div className="flex items-start justify-between"><div><h2 className="text-xl font-bold text-white">{confirmation === "delete" ? "Delete workspace" : "Leave workspace?"}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{confirmation === "delete" ? "This action cannot be undone. Type the workspace name to permanently delete all channels, messages, files, and invitations." : "You will lose access until you are invited again."}</p></div><button onClick={() => setConfirmation(null)} className="text-slate-400 hover:text-white"><X size={18} /></button></div>
            {confirmation === "delete" && <input value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} placeholder={activeWorkspace.name} className="mt-5 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-white outline-none focus:border-red-400" />}
            <div className="mt-6 flex justify-end gap-3"><button onClick={() => setConfirmation(null)} className="rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">Cancel</button><button onClick={handleWorkspaceAction} disabled={actionLoading || (confirmation === "delete" && confirmationText !== activeWorkspace.name)} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50">{confirmation === "delete" ? "Delete workspace" : "Leave workspace"}</button></div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChannelList;
