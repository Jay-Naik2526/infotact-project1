import React, { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Link,
  Loader2,
  Mail,
  MessageCircle,
  QrCode,
  Send,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import api from "../../services/api.ts";
import { useWorkspace } from "../../hooks/useWorkspace.ts";
import { useToast } from "../ui/ToastProvider.tsx";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const InviteMemberModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { activeWorkspace } = useWorkspace();
  const { showToast } = useToast();
  const [inviteLink, setInviteLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    setCopied(false);
    setError("");

    if (activeWorkspace?.inviteToken) {
      setInviteLink(`${window.location.origin}/invite/${activeWorkspace.inviteToken}`);
    }
  }, [isOpen, activeWorkspace]);

  if (!isOpen) return null;

  const handleGenerate = async (refresh = false) => {
    if (!activeWorkspace) {
      setError("No workspace selected");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setCopied(false);

      const response = await api.post("/workspaces/invite", {
        workspaceId: activeWorkspace.id,
        refresh,
      });

      const data = response.data;
      setInviteLink(data.inviteLink || `${window.location.origin}/invite/${data.inviteToken}`);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to generate invite link");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) return;

    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      showToast("Invite link copied successfully");

      setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch (err) {
      console.error(err);
      showToast("Could not copy invite link", "error");
    }
  };

  const handleAddMember = async () => {
  if (!activeWorkspace) return;

  if (!email.trim()) {
    showToast("Please enter member email", "error");
    return;
  }

  try {
    setLoading(true);

    await api.post(
      `/workspaces/${activeWorkspace.id}/members`,
      {
        email,
      }
    );

    showToast("Member added successfully");

    setEmail("");

    onClose();

  } catch (err: any) {
    console.error(err);

    showToast(
      err.response?.data?.message || "Failed to add member",
      "error"
    );

  } finally {
    setLoading(false);
  }
};


  const openShareLink = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const encodedInviteLink = encodeURIComponent(inviteLink);
  const shareButtons = [
    {
      label: "WhatsApp",
      icon: MessageCircle,
      href: `https://wa.me/?text=${encodedInviteLink}`,
      className: "hover:border-emerald-400/50 hover:bg-emerald-500/10 hover:text-emerald-200",
    },
    {
      label: "Telegram",
      icon: Send,
      href: `https://t.me/share/url?url=${encodedInviteLink}`,
      className: "hover:border-sky-400/50 hover:bg-sky-500/10 hover:text-sky-200",
    },
    {
      label: "Email",
      icon: Mail,
      href: `mailto:?subject=Workspace Invite&body=${encodedInviteLink}`,
      className: "hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-violet-200",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[560px] overflow-hidden rounded-3xl border border-[#1E293B] bg-[#111118] shadow-2xl shadow-black/50 animate-scale-up">
        <div className="relative border-b border-[#1E293B] bg-gradient-to-br from-violet-600/20 via-[#111118] to-[#111118] p-6">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close invite modal"
          >
            <X size={18} />
          </button>

          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-600/25">
            <UserPlus size={22} />
          </div>

          <h2 className="text-2xl font-bold text-white">Invite people</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Bring teammates into{" "}
            <span className="font-semibold text-violet-300">
              {activeWorkspace?.name || "this workspace"}
            </span>{" "}
            with a secure invite link.
          </p>
        </div>
        

        <div className="rounded-2xl border border-[#1E293B] bg-[#0A0A0F] p-4">

  <div className="mb-3 text-sm font-semibold text-white">
    Add Member by Email
  </div>

  <input
    type="email"
    placeholder="Enter member email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    className="mb-3 h-11 w-full rounded-xl border border-[#1E293B] bg-[#111118] px-3 text-white outline-none"
  />

  <button
    onClick={handleAddMember}
    disabled={loading}
    className="h-11 w-full rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700"
  >
    Add Member
  </button>

</div>

        <div className="space-y-5 p-6">
          <div className="rounded-2xl border border-[#1E293B] bg-[#0A0A0F] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Sparkles size={16} className="text-violet-400" />
              Workspace invite
            </div>

            {inviteLink ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Link
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400"
                  />
                  <input
                    readOnly
                    value={inviteLink}
                    className="h-11 w-full rounded-xl border border-[#1E293B] bg-[#111118] pl-10 pr-3 text-sm text-slate-200 outline-none"
                  />
                </div>

                <button
                  onClick={handleCopy}
                  className={`flex h-11 min-w-[104px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition ${
                    copied
                      ? "bg-emerald-600 shadow-lg shadow-emerald-600/20"
                      : "bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-600/20"
                  }`}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleGenerate()}
                disabled={loading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Link size={18} />}
                {loading ? "Generating invite..." : "Generate Invite Link"}
              </button>
            )}
          </div>

          {inviteLink && (
            <div className="grid gap-4 md:grid-cols-[168px_1fr]">
              <div className="rounded-2xl border border-[#1E293B] bg-white p-3">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${encodedInviteLink}`}
                  alt="Workspace invite QR code"
                  className="h-full w-full rounded-xl"
                />
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-[#1E293B] bg-[#0A0A0F] p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                    <QrCode size={16} className="text-violet-400" />
                    Scan or share
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {shareButtons.map((button) => {
                      const Icon = button.icon;

                      return (
                        <button
                          key={button.label}
                          onClick={() => openShareLink(button.href)}
                          className={`flex h-11 items-center justify-center gap-2 rounded-xl border border-[#1E293B] bg-[#181824] px-3 text-sm font-semibold text-slate-300 transition duration-200 ${button.className}`}
                        >
                          <Icon size={16} />
                          {button.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={() => handleGenerate(true)}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#1E293B] bg-[#181824] py-3 text-sm font-medium text-slate-200 transition hover:border-violet-500/50 hover:text-white disabled:opacity-50"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  Refresh invite link
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {copied && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300 animate-scale-up">
              <Check size={16} />
              Invite link copied successfully
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InviteMemberModal;
