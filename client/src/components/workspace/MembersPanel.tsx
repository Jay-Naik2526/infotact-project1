import React, { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, UserRound, Users } from "lucide-react";
import InviteMemberModal from "./InviteMemberModal";
import api from "../../services/api.ts";
import { useWorkspace } from "../../hooks/useWorkspace.ts";
import { socket } from "../../services/socket.ts";
import { useAuth } from "../../hooks/useAuth.ts";
import { useToast } from "../ui/ToastProvider.tsx";

interface Member {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  role?: string;
  isOnline?: boolean;
}

const MembersPanel: React.FC = () => {
  const [openInvite, setOpenInvite] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isOwner = activeWorkspace?.ownerId === user?.id;

  useEffect(() => {
    if (!activeWorkspace) {
      setMembers([]);
      return;
    }

    fetchMembers();
  }, [activeWorkspace?.id]);

  useEffect(() => {
    const refreshMembers = ({ workspaceId }: { workspaceId: string }) => {
      if (workspaceId === activeWorkspace?.id) void fetchMembers();
    };
    socket.on("workspace:member-added", refreshMembers);
    socket.on("workspace:member-left", refreshMembers);
    socket.on("workspace:member-removed", refreshMembers);
    return () => {
      socket.off("workspace:member-added", refreshMembers);
      socket.off("workspace:member-left", refreshMembers);
      socket.off("workspace:member-removed", refreshMembers);
    };
  }, [activeWorkspace?.id]);

  useEffect(() => {
    const handleOnlineUsers = (onlineUserIds: string[]) => {
      setMembers((prev) =>
        prev.map((member) => {
          const id = member.id || member._id;
          return {
            ...member,
            isOnline: id ? onlineUserIds.includes(id) : false,
          };
        })
      );
    };

    socket.on("users:online", handleOnlineUsers);

    return () => {
      socket.off("users:online", handleOnlineUsers);
    };
  }, []);

  const fallbackMembers = () =>
    (((activeWorkspace?.members || []) as any[]).filter(
      (member) => member && typeof member === "object" && "email" in member
    ) as Member[]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get(`/workspaces/${activeWorkspace?.id}/members`);
      setMembers(response.data.data || []);
    } catch (err: any) {
      console.error("Failed to load members:", err);
      const fallback = fallbackMembers();
      setMembers(fallback);
      if (fallback.length === 0) {
        setError(err.response?.data?.message || "Members could not be loaded");
      }
    } finally {
      setLoading(false);
    }
  };

  const visibleMembers = useMemo(
    () => members.filter((member) => `${member.name} ${member.email}`.toLowerCase().includes(search.toLowerCase())),
    [members, search]
  );

  const handleRemoveMember = async (memberId: string) => {
    if (!activeWorkspace || !isOwner) return;
    try {
      setRemovingMemberId(memberId);
      await api.delete(`/workspaces/${activeWorkspace.id}/member/${memberId}`);
      setMembers((previous) => previous.filter((member) => (member.id || member._id) !== memberId));
      showToast("Member removed from workspace");
    } catch (requestError) {
      console.error("Remove member failed:", requestError);
      showToast("Unable to remove member", "error");
    } finally {
      setRemovingMemberId(null);
    }
  };

  return (
    <div id="members-panel" className="hidden h-screen w-[272px] shrink-0 border-l border-white/8 bg-[#0b0b12]/90 p-4 backdrop-blur-xl xl:flex xl:flex-col">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
            Members
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            {activeWorkspace?.name || "Workspace"}
          </p>
        </div>

        <button
          onClick={() => setOpenInvite(true)}
          disabled={!isOwner}
          className="rounded-xl border border-[#1E293B] bg-[#111118] p-2 text-[#94A3B8] transition hover:border-violet-500/50 hover:bg-violet-500/10 hover:text-violet-300"
          title={isOwner ? "Invite Member" : "Only the owner can invite members"}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search members" className="h-9 w-full rounded-xl border border-[#1E293B] bg-[#111118] pl-9 pr-3 text-xs text-white outline-none focus:border-violet-500" />
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {loading ? (
          [1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-xl bg-[#111118] p-3 animate-pulse">
              <div className="h-10 w-10 rounded-full bg-white/10" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-white/10" />
                <div className="h-2 w-32 rounded bg-white/10" />
              </div>
            </div>
          ))
        ) : visibleMembers.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-[#1E293B] bg-[#0D0E14] p-5 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600/10 text-violet-300">
              <Users size={22} />
            </div>
            <p className="text-sm font-semibold text-white">No members yet</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Invite teammates to start collaborating in this workspace.
            </p>
            {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
          </div>
        ) : (
          visibleMembers.map((member) => {
            const id = member.id || member._id || member.email;
            const online = Boolean(member.isOnline);
            const isWorkspaceOwner = id === activeWorkspace?.ownerId;

            return (
              <div
                key={id}
                className="group rounded-2xl border border-white/8 bg-white/[0.025] p-3 transition duration-200 hover:-translate-y-0.5 hover:border-violet-500/40 hover:bg-violet-500/[0.06] hover:shadow-lg hover:shadow-violet-600/5"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white shadow-lg shadow-violet-600/20">
                      {member.name ? member.name.charAt(0).toUpperCase() : <UserRound size={18} />}
                    </div>
                    <span
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#111118] ${
                        online ? "bg-emerald-500" : "bg-slate-500"
                      }`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">
                        {member.name || "Unknown user"}
                      </p>
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${isWorkspaceOwner ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-violet-500/20 bg-violet-500/10 text-violet-300"}`}>
                        {isWorkspaceOwner ? "owner" : "member"}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-500">{member.email}</p>
                    <p className={`mt-1 text-[11px] ${online ? "text-emerald-400" : "text-slate-500"}`}>
                      {online ? "Online" : "Offline"}
                    </p>
                  </div>
                  {isOwner && !isWorkspaceOwner && (
                    <button onClick={() => handleRemoveMember(id)} disabled={removingMemberId === id} className="rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50" title="Remove member">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 border-t border-[#1E1E2F] pt-3 text-center text-xs text-gray-500">
        {members.length} {members.length === 1 ? "member" : "members"}
      </div>
      <InviteMemberModal
      isOpen={openInvite && isOwner}
      onClose={() => {
        setOpenInvite(false);
        fetchMembers();
      }}
    />
    </div>
  );
};

export default MembersPanel;
