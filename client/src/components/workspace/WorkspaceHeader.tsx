import React, { useState } from 'react';
import api from "../../services/api.ts";
import { useWorkspace } from '../../hooks/useWorkspace.ts';
import { ChevronDown, UserPlus, Check, Copy } from 'lucide-react';

export const WorkspaceHeader: React.FC = () => {
  const { activeWorkspace } = useWorkspace();
  const [copied, setCopied] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleInviteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!activeWorkspace) return;

    try {
      const response = await api.post("/workspaces/invite", {
        workspaceId: activeWorkspace.id,
      });

      const inviteUrl =
        response.data.inviteLink ||
        `${window.location.origin}/invite/${response.data.inviteToken}`;

      await navigator.clipboard.writeText(inviteUrl);

      setCopied(true);

      setTimeout(() => setCopied(false), 2000);

    } catch (err) {
      console.error(err);
    }
  };

  const toggleDropdown = () => {
    setShowDropdown((prev) => !prev);
  };

  if (!activeWorkspace) {
    return (
      <div className="h-14 border-b border-[#1E1E2F] bg-[#0B0B0F] flex items-center px-4 select-none">
        <h2 className="text-sm font-heading font-bold text-[#64748B]">No Workspace</h2>
      </div>
    );
  }

  return (
    <div className="relative">
      <div 
        onClick={toggleDropdown}
        className="h-14 border-b border-[#1E1E2F] bg-[#07070A] hover:bg-[#0B0B0F] transition-colors duration-200 flex items-center justify-between px-4 cursor-pointer select-none"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <h2 className="text-sm font-heading font-bold text-[#F1F5F9] truncate" title={activeWorkspace.name}>
            {activeWorkspace.name}
          </h2>
          <ChevronDown size={14} className="text-[#64748B] flex-shrink-0" />
        </div>

        {/* Invite Button */}
        <div className="relative group">
          <button
            onClick={handleInviteClick}
            className="p-1.5 rounded-lg bg-[#111118] border border-[#1E293B] hover:border-[#7C3AED]/50 hover:bg-[#7C3AED]/10 text-[#94A3B8] hover:text-white transition-all duration-200 cursor-pointer"
            title="Invite members"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <UserPlus size={14} />}
          </button>
          
          {/* Tooltip */}
          <div className="absolute right-0 top-9 bg-[#111118] text-[#F1F5F9] text-[10px] font-semibold py-1 px-2 rounded border border-[#1E293B] shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50 font-body">
            {copied ? 'Link Copied!' : 'Copy Invite Link'}
          </div>
        </div>
      </div>

      {/* Simple Dropdown Menu */}
      {showDropdown && (
        <>
          {/* Backdrop to close dropdown */}
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
          <div className="absolute left-4 right-4 top-15 bg-[#0F0F16] border border-[#1E1E2F] rounded-lg shadow-xl p-3 z-50 animate-fade-in">
            <div className="text-[10px] uppercase font-bold text-[#64748B] tracking-wider mb-2 font-body">
              Workspace Details
            </div>
            <div className="text-xs text-[#CBD5E1] font-body flex flex-col gap-2">
              <div>
                <span className="text-[#64748B]">ID:</span> <span className="font-mono text-[10px] bg-[#111118] px-1 py-0.5 rounded border border-[#1E293B]">{activeWorkspace.id}</span>
              </div>
              {activeWorkspace.inviteToken && (
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B]">Invite Code:</span>
                  <button 
                    onClick={handleInviteClick}
                    className="flex items-center gap-1 text-[10px] text-[#7C3AED] hover:underline"
                  >
                    <Copy size={10} /> Copy URL
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.15s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default WorkspaceHeader;
