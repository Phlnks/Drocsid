import React, { useState, useRef, useEffect, lazy, Suspense } from "react";
import { supabase } from "../supabase";
import { useAuthStore } from "../store/authStore";
import { useAppStore } from "../store/appStore";
import {
  PlusCircle,
  Loader2,
  Send,
  SmilePlus,
  X,
  Image as ImageIcon,
  AtSign,
  Mic,
  StopCircle,
  FileUp,
  BarChart3,
} from "lucide-react";
const EmojiPicker = lazy(() => import("emoji-picker-react"));
import PromptModal from "./ui/PromptModal";
import socket from "../lib/socket";
import PollModal from "./PollModal";
import { useTranslation } from "react-i18next";

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

const processImageForSupabase = async (file: File): Promise<string> => {
  const MAX_FILE_SIZE = 700 * 1024;

  if (file.size <= MAX_FILE_SIZE) {
    return await fileToBase64(file);
  }

  if (file.type === "image/gif") {
    throw new Error("GIF_TOO_LARGE");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.85);

        if (compressedBase64.length > 1000000) {
          reject(new Error("IMAGE_STILL_TOO_LARGE"));
        } else {
          resolve(compressedBase64);
        }
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

import GifPicker from "./GifPicker";

interface MessageInputProps {
  channelId: string;
  serverId: string;
  isDM?: boolean;
  replyingTo?: any;
  onCancelReply?: () => void;
  onEditLastMessage?: () => void;
}

export default function MessageInput({
  channelId,
  serverId,
  isDM = false,
  replyingTo,
  onCancelReply,
  onEditLastMessage,
}: MessageInputProps) {
  const { t } = useTranslation();
  const { user, currentUserProfile } = useAuthStore();
  const { addNotification, drafts, setDraft } = useAppStore();
  const [content, setContent] = useState(drafts[channelId] || "");
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [promptConfig, setPromptConfig] = useState<{
    isOpen: boolean;
    title: string;
    label: string;
    onSubmit: (val: string) => void;
  }>({
    isOpen: false,
    title: "",
    label: "",
    onSubmit: () => {},
  });
  const [isDragging, setIsDragging] = useState(false);
  const [serverEmojis, setServerEmojis] = useState<
    { name: string; url: string }[]
  >([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null
  );
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recordingIntervalRef = useRef<any>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        addMenuRef.current &&
        !addMenuRef.current.contains(event.target as Node)
      ) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: "audio/webm" });
        const voiceFile = new File(
          [audioBlob],
          `voice-message-${Date.now()}.webm`,
          { type: "audio/webm" }
        );
        await sendPayload("", voiceFile, null, "voice");
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      addNotification(t("errors.micAccessDenied"), "error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }
  };

  useEffect(() => {
    if (replyingTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyingTo]);

  useEffect(() => {
    setContent(drafts[channelId] || "");
  }, [channelId]);

  React.useLayoutEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(
        inputRef.current.scrollHeight,
        120
      )}px`;
    }
  }, [content]);

  // ✅ FIX: chargement filtré — avant: select('*') chargeait TOUTE la table profiles
  useEffect(() => {
    if (!user) return;
    const fetchUsers = async () => {
      try {
        let memberIds: string[] = [];

        if (serverId && !isDM) {
          const { data: members } = await supabase
            .from("server_members")
            .select("user_id")
            .eq("server_id", serverId);
          memberIds = (members ?? [])
            .map((m: any) => m.user_id)
            .filter(Boolean);
        } else {
          const { data: dms } = await supabase
            .from("dms")
            .select("participants")
            .contains("participants", [user.id]);
          const set = new Set<string>();
          (dms ?? []).forEach((dm: any) =>
            dm.participants?.forEach((p: string) => {
              if (p !== user.id) set.add(p);
            })
          );
          memberIds = Array.from(set);
        }

        if (memberIds.length === 0) return;

        const { data } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", memberIds);

        if (data) setUsers(data);
      } catch (err) {
        console.error("[MessageInput] fetchUsers error:", err);
      }
    };
    fetchUsers();
  }, [serverId, isDM, user]);

  useEffect(() => {
    if (serverId && !isDM) {
      const fetchEmojis = async () => {
        const { data } = await supabase
          .from("servers")
          .select("custom_emojis")
          .eq("id", serverId)
          .maybeSingle();
        if (data && data.custom_emojis) {
          setServerEmojis(data.custom_emojis);
        }
      };
      fetchEmojis();

      const chanName = `server_emojis_${serverId}`;
      supabase.getChannels().forEach((c) => {
        if (c.topic === `realtime:${chanName}`) supabase.removeChannel(c);
      });
      const channel = supabase
        .channel(chanName)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "servers",
            filter: `id=eq.${serverId}`,
          },
          (payload) => {
            if (payload.new && payload.new.custom_emojis) {
              setServerEmojis(payload.new.custom_emojis);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [serverId, isDM]);

  const filteredUsers =
    mentionQuery !== null
      ? [{ username: "everyone", id: "everyone" }, ...users].filter((u) =>
          (u.username || u.displayName || "")
            .toLowerCase()
            .includes(mentionQuery.toLowerCase())
        )
      : [];

  const insertMention = (username: string) => {
    if (!inputRef.current) return;
    const cursorPosition = inputRef.current.selectionStart || 0;
    const textBeforeCursor = content.slice(0, cursorPosition);
    const textAfterCursor = content.slice(cursorPosition);

    const match = textBeforeCursor.match(/(?:^|\s)@([^"'\s]*)$/);
    if (match) {
      const start = cursorPosition - match[1].length - 1;
      const mentionText = /^[a-zA-Z0-9_-]+$/.test(username)
        ? `@${username}`
        : `@"${username}"`;
      const newContent =
        content.slice(0, start) + `${mentionText} ` + textAfterCursor;
      setContent(newContent);
      setMentionQuery(null);

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = start + mentionText.length + 1;
          inputRef.current.selectionEnd = start + mentionText.length + 1;
          inputRef.current.focus();
        }
      }, 0);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    setDraft(channelId, val);

    const cursorPosition = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPosition);
    const match = textBeforeCursor.match(/(?:^|\s)@([^"'\s]*)$/);

    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }

    if (user) {
      socket.emit("typing", {
        channelId,
        userId: user.id,
        username: user.user_metadata?.username || "User",
        isTyping: !!val.trim(),
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredUsers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredUsers.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(
          (prev) => (prev - 1 + filteredUsers.length) % filteredUsers.length
        );
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filteredUsers[mentionIndex].username);
      } else if (e.key === "Escape") {
        setMentionQuery(null);
      }
      return;
    }

    if (e.key === "ArrowUp" && !content && onEditLastMessage) {
      e.preventDefault();
      onEditLastMessage();
    }

    if (e.key === "Escape") {
      if (replyingTo && onCancelReply) {
        onCancelReply();
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const sendPayload = async (
    textToSend: string,
    fileToSend: File | null,
    gifUrl: string | null = null,
    forcedType?: string,
    pollData?: any
  ) => {
    if (
      (!textToSend.trim() && !fileToSend && !gifUrl && !pollData) ||
      !user ||
      isUploading
    )
      return;

    if (fileToSend && fileToSend.size > 20 * 1024 * 1024) {
      addNotification(t("errors.fileTooLarge", { max: 20 }), "error");
      return;
    }

    // Optimistically clear the input UI
    const previousContent = textToSend;
    const previousReply = replyingTo;
    if (!fileToSend && !gifUrl && !pollData) {
      setDraft(channelId, "");
      setContent("");
      setMentionQuery(null);
      if (inputRef.current) inputRef.current.style.height = "auto";
      if (replyingTo && onCancelReply) onCancelReply();
    }

    setIsUploading(true);
    let imageUrl = gifUrl;

    try {
      if (fileToSend) {
        const fileExt = fileToSend.name.split(".").pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${channelId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("chat-attachments")
          .upload(filePath, fileToSend);

        if (uploadError) {
          if (fileToSend.type.startsWith("image/")) {
            console.warn(
              "Storage upload failed, falling back to base64 compression",
              uploadError
            );
            imageUrl = await processImageForSupabase(fileToSend);
          } else {
            console.error(
              "Storage upload failed for non-image file",
              uploadError
            );
            if (uploadError.message === "Failed to fetch") {
              throw new Error(
                "L'envoi a échoué (CORS / Failed to fetch). Si vous utilisez Nginx, assurez-vous d'avoir ajouté 'client_max_body_size 50M;' dans votre bloc 'listen 443 ssl' (HTTPS), et non pas seulement dans le bloc HTTP."
              );
            }
            throw new Error(
              `Erreur lors de l'envoi du fichier: ${
                uploadError?.message ||
                (uploadError as any)?.error ||
                "Erreur inconnue"
              }`
            );
          }
        } else {
          const {
            data: { publicUrl },
          } = supabase.storage.from("chat-attachments").getPublicUrl(filePath);
          imageUrl = publicUrl;
        }
      }

      let attachmentType = forcedType || "file";
      if (!forcedType) {
        const isAudioExt = fileToSend && /\.(m4a|mp3|wav|ogg|aac|flac)$/i.test(fileToSend.name);
        
        if (gifUrl || (fileToSend && fileToSend.type.startsWith("image/"))) {
          attachmentType = "image";
        } else if (isAudioExt || (fileToSend && fileToSend.type.startsWith("audio/"))) {
          attachmentType = "audio";
        } else if (fileToSend && fileToSend.type.startsWith("video/")) {
          attachmentType = "video";
        }
      }

      const attachmentsArray: any[] = imageUrl
        ? [
            {
              url: imageUrl,
              type: attachmentType,
              name: fileToSend?.name || (gifUrl ? "gif" : "file"),
              size: fileToSend?.size || 0,
            },
          ]
        : [];

      if (pollData) {
        attachmentsArray.push({
          type: "poll",
          data: pollData,
        });
      }

      const messageData: any = {
        author_id: user.id,
        content: textToSend.trim() || "",
        attachments: attachmentsArray,
      };

      if (isDM) {
        messageData.dm_id = channelId;
      } else {
        messageData.channel_id = channelId;
        messageData.server_id = serverId;
      }

      if (replyingTo) {
        messageData.reply_to = replyingTo.id;
      }

      // 1. Send the message
      const tableName = isDM ? "dm_messages" : "messages";
      const { data: newMessage, error: insertError } = await supabase
        .from(tableName)
        .insert(messageData)
        .select()
        .maybeSingle();

      if (insertError || !newMessage) {
        setContent(previousContent);
        setDraft(channelId, previousContent);
        throw insertError || new Error("Failed to send message");
      }

      // 2. Update last_message_at for unread tracking
      const timestamp = new Date().toISOString();
      if (isDM) {
        await supabase
          .from("dms")
          .update({ last_message_at: timestamp })
          .eq("id", channelId);
      } else {
        await supabase
          .from("channels")
          .update({ last_message_at: timestamp })
          .eq("id", channelId);
      }

      // Explicitly tell socket
      const eventName = isDM ? "new-dm-message" : "new-message";
      const currentProfile = users?.find((u) => u.id === user.id);
      const authorName =
        currentProfile?.username ||
        currentProfile?.display_name ||
        user?.user_metadata?.username ||
        user?.user_metadata?.display_name ||
        user?.email?.split("@")[0] ||
        "Utilisateur";

      socket.emit(eventName, { ...newMessage, author_name: authorName });

      // --- MENTION & NOTIFICATION LOGIC ---
      try {
        const mentionedUserIds = new Set<string>();

        if (!isDM && textToSend.includes("@")) {
          // Accurate regex for mentions: handles @username and @"user name"
          const mentionRegex = /@(?:"([^"]+)"|([a-zA-Z0-9_.\-]+))/g;
          let match;

          while ((match = mentionRegex.exec(textToSend)) !== null) {
            const rawUsername = match[1] || match[2];
            if (!rawUsername) continue;
            
            const username = rawUsername;
            
            if (username.toLowerCase() === "everyone") {
              users.forEach((u) => {
                if (u.id !== user.id) mentionedUserIds.add(u.id);
              });
              continue;
            }

            // Match with existing users state (case-insensitive)
            let mentionedUser = users?.find(
              (u) =>
                (u.username || "").toLowerCase() === username.toLowerCase() ||
                (u.display_name || "").toLowerCase() === username.toLowerCase()
            );

            if (!mentionedUser) {
              // Fetch user if not in local member list (e.g. if member list is large or paging)
              // We use ilike for case-insensitivity which is better for mentions
              // We wrap in double quotes if there are spaces for PostgREST compatibility
              const filterVal = username.includes(' ') ? `"${username}"` : username;
              const { data } = await supabase
                .from("profiles")
                .select("id, username, display_name")
                .or(`username.ilike.${filterVal},display_name.ilike.${filterVal}`)
                .maybeSingle();
              if (data) mentionedUser = data;
            }

            if (mentionedUser && mentionedUser.id !== user.id) {
              mentionedUserIds.add(mentionedUser.id);
            }
          }

          if (mentionedUserIds.size > 0) {
            const currentProfile = users?.find((u) => u.id === user.id);
            const currentUsername =
              currentUserProfile?.username ||
              currentUserProfile?.display_name ||
              currentProfile?.username ||
              currentProfile?.display_name ||
              user?.user_metadata?.username ||
              user?.user_metadata?.display_name ||
              user?.email?.split("@")[0] ||
              "Utilisateur";

            // Get names from current context for better notifications
            let serverName = "Serveur";
            let channelName = "salon";

            try {
              if (serverId) {
                const { data: sInfo } = await supabase.from('servers').select('name').eq('id', serverId).maybeSingle();
                if (sInfo?.name) serverName = sInfo.name;
              }
              if (channelId) {
                const { data: cInfo } = await supabase.from('channels').select('name').eq('id', channelId).maybeSingle();
                if (cInfo?.name) channelName = cInfo.name;
              }
            } catch (err) {
              console.error("Failed to fetch context names for notification", err);
            }

            for (const targetId of Array.from(mentionedUserIds)) {
              const { error: notifErr } = await supabase.from("notifications").insert({
                user_id: targetId,
                type: "mention",
                data: {
                  author_id: user.id,
                  author_name: currentUsername,
                  content: textToSend.slice(0, 200),
                  server_id: serverId,
                  server_name: serverName,
                  channel_id: channelId,
                  channel_name: channelName,
                  message_id: newMessage.id,
                  is_dm: false,
                },
                read: false,
                notified: false,
              });
              if (notifErr) {
                console.error("❌ [Db Notifications] Mention insert failed:", notifErr);
              } else {
                console.log("✅ [Db Notifications] Mention inserted for:", targetId);
              }
            }
          }
        }

        // Reply notification
        if (
          replyingTo &&
          replyingTo.author_id !== user.id &&
          !mentionedUserIds.has(replyingTo.author_id)
        ) {
          const currentProfile = users?.find((u) => u.id === user.id);
          const currentUsername =
            currentUserProfile?.username ||
            currentUserProfile?.display_name ||
            currentProfile?.username ||
            currentProfile?.display_name ||
            user?.user_metadata?.username ||
            user?.user_metadata?.display_name ||
            user?.email?.split("@")[0] ||
            "Utilisateur";

          // Get names from current context for better notifications
          let serverName = "Serveur";
          let channelName = "salon";

          if (!isDM) {
            try {
              if (serverId) {
                const { data: sInfo } = await supabase.from('servers').select('name').eq('id', serverId).maybeSingle();
                if (sInfo?.name) serverName = sInfo.name;
              }
              if (channelId) {
                const { data: cInfo } = await supabase.from('channels').select('name').eq('id', channelId).maybeSingle();
                if (cInfo?.name) channelName = cInfo.name;
              }
            } catch (err) {
              console.error("Failed to fetch context names for notification", err);
            }
          }

          const { error: notifErr } = await supabase.from("notifications").insert({
            user_id: replyingTo.author_id,
            type: "reply",
            data: {
              author_id: user.id,
              author_name: currentUsername,
              content:
                textToSend.slice(0, 200) ||
                (fileToSend ? "📎 Fichier" : "Message"),
              server_id: isDM ? undefined : serverId,
              server_name: serverName,
              channel_id: channelId,
              channel_name: channelName,
              message_id: newMessage.id,
              is_dm: isDM,
            },
            read: false,
            notified: false,
          });
          if (notifErr) {
            console.error("❌ [Db Notifications] Reply insert failed:", notifErr);
          } else {
            console.log("✅ [Db Notifications] Reply inserted for:", replyingTo.author_id);
          }
        }

        // Automatically create notification for DM recipient
        if (isDM) {
          const { data: dmData } = await supabase
            .from("dms")
            .select("participants")
            .eq("id", channelId)
            .maybeSingle();
          if (dmData && dmData.participants) {
            const recipients = dmData.participants.filter(
              (p: string) => p !== user.id
            );
            if (recipients.length > 0) {
              const currentProfile = users?.find((u) => u.id === user.id);
              const currentUsername =
                currentUserProfile?.username ||
                currentUserProfile?.display_name ||
                currentProfile?.username ||
                currentProfile?.display_name ||
                user?.user_metadata?.username ||
                user?.user_metadata?.display_name ||
                user?.email?.split("@")[0] ||
                "Utilisateur";
              for (const targetId of recipients) {
                // Skip if we already sent a reply notification to this exact person
                if (replyingTo && replyingTo.author_id === targetId) continue;

                const { error: notifErr } = await supabase.from("notifications").insert({
                  user_id: targetId,
                  type: "dm",
                  data: {
                    author_id: user.id,
                    author_name: currentUsername,
                    content:
                      textToSend.slice(0, 200) ||
                      (fileToSend ? "📎 Fichier" : "Message"),
                    channel_id: channelId, // for DM, we use dm_id as channel_id in notifications
                    message_id: newMessage.id,
                    is_dm: true,
                  },
                  read: false,
                  notified: false,
                });
                if (notifErr) {
                  console.error("❌ [Db Notifications] DM recipient insert failed:", notifErr);
                } else {
                  console.log("✅ [Db Notifications] DM recipient inserted for:", targetId);
                }
              }
            }
          }
        }
      } catch (notifErr) {
        console.error("Error creating notifications:", notifErr);
        // We don't throw here to not block the message sending success
      }
      // ------------------------------------

      // Clear draft after successful send if it was not optimistically cleared
      if (fileToSend || gifUrl) {
        setDraft(channelId, "");
        setContent("");
        setMentionQuery(null);
        if (onCancelReply) onCancelReply();
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      if (user) {
        socket.emit("typing", {
          channelId,
          userId: user.id,
          username: user.user_metadata?.username || "User",
          isTyping: false,
        });
      }

      // Keep focus on input after sending
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    } catch (error: any) {
      console.error("Error sending message:", error);
      if (error.message === "GIF_TOO_LARGE") {
        addNotification(t("errors.gifTooLarge"), "error");
      } else if (error.message === "IMAGE_STILL_TOO_LARGE") {
        addNotification(t("errors.imageTooComplex"), "error");
      } else {
        addNotification(t("errors.messageSendFailed"), "error");
      }
    } finally {
      setIsUploading(false);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 50);
    }
  };

  const handleFileSelect = async (e: any) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await sendPayload(content, file);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (mentionQuery !== null && filteredUsers.length > 0) {
      // If pressing enter while mention dropdown is open, insert mention instead of sending
      insertMention(filteredUsers[mentionIndex].username);
      return;
    }
    await sendPayload(content, null);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await sendPayload(content, file);
          break;
        }
      }
    }
  };

  const handleEmojiClick = (emojiData: any) => {
    let emojiText = emojiData.emoji;
    if (emojiData.isCustom) {
      emojiText = `![custom_emoji:${emojiData.names[0]}](${emojiData.imageUrl}) `;
    }

    const newContent = content + emojiText;
    setContent(newContent);
    setDraft(channelId, newContent);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const handleGifClick = () => {
    setShowGifPicker(!showGifPicker);
  };

  const handleGifSelect = async (url: string) => {
    setShowGifPicker(false);
    await sendPayload(content, null, url);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      await sendPayload(content, file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Only set dragging to false if we leave the main container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  return (
    <div
      className="p-4 pb-safe shrink-0 flex flex-col gap-2 relative"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      {isDragging && (
        <div className="absolute inset-2 -top-4 rounded-xl border-2 border-dashed border-indigo-500 bg-indigo-500/10 z-50 flex items-center justify-center backdrop-blur-sm pointer-events-none transition-all">
          <div className="bg-indigo-500/90 text-white px-6 py-3 justify-center rounded-full font-medium shadow-lg flex items-center gap-2">
            <PlusCircle className="w-5 h-5" />
            Déposer le fichier pour l'envoyer
          </div>
        </div>
      )}
      {mentionQuery !== null && filteredUsers.length > 0 && (
        <div className="absolute bottom-full left-4 mb-2 w-64 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg overflow-hidden z-50">
          <div className="p-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-700">
            Mentions
          </div>
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            {filteredUsers.map((user, idx) => (
              <div
                key={user.id}
                onClick={() => insertMention(user.username)}
                className={`px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors ${
                  idx === mentionIndex
                    ? "bg-indigo-500/20 text-indigo-300"
                    : "text-zinc-300 hover:bg-zinc-700/50"
                }`}
              >
                <AtSign className="w-4 h-4 opacity-50" />
                <span className="font-medium">{user.username}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {replyingTo && (
        <div className="flex items-center justify-between bg-zinc-800/80 px-4 py-2 rounded-t-lg border-l-4 border-indigo-500 text-sm">
          <div className="flex items-center gap-2 text-zinc-300 truncate">
            <span className="font-semibold">
              En réponse à @{replyingTo.author_name}
            </span>
            <span className="text-zinc-500 truncate max-w-md">
              {replyingTo.content}
            </span>
          </div>
          <button
            onClick={onCancelReply}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={`bg-zinc-700 flex items-center px-4 py-2 gap-3 transition-colors ${
          replyingTo ? "rounded-b-lg rounded-tr-lg" : "rounded-lg"
        } ${isDragging ? "ring-2 ring-indigo-500 bg-zinc-700/80" : ""}`}
      >
        <div className="relative" ref={addMenuRef}>
          <button
            type="button"
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
            disabled={isUploading || isRecording}
            title="Options d'envoi"
          >
            <PlusCircle className="w-6 h-6" />
          </button>

          {showAddMenu && (
            <div className="absolute bottom-full left-0 mb-4 w-48 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg overflow-hidden z-50">
              <button
                type="button"
                onClick={() => {
                  fileInputRef.current?.click();
                  setShowAddMenu(false);
                }}
                className="w-full px-4 py-2 flex items-center gap-3 text-zinc-300 hover:bg-zinc-700 transition-colors text-sm"
              >
                <FileUp className="w-4 h-4 text-zinc-400" />
                {t("messageInput.uploadFile")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPollModalOpen(true);
                  setShowAddMenu(false);
                }}
                className="w-full px-4 py-2 flex items-center gap-3 text-zinc-300 hover:bg-zinc-700 transition-colors text-sm"
              >
                <BarChart3 className="w-4 h-4 text-zinc-400" />
                {t("polls.createPoll")}
              </button>
            </div>
          )}
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
        />

        {isRecording ? (
          <div className="flex-1 flex items-center gap-3 bg-zinc-800/50 rounded-md px-3 py-1 text-zinc-200">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="font-mono text-sm">
              {formatTime(recordingTime)}
            </span>
            <span className="text-zinc-400 text-xs italic">
              Enregistrement en cours...
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => {
                setIsRecording(false);
                if (mediaRecorder) mediaRecorder.stop();
                setMediaRecorder(null);
                clearInterval(recordingIntervalRef.current);
              }}
              className="text-zinc-500 hover:text-zinc-300 transition-colors text-xs font-semibold"
            >
              Annuler
            </button>
          </div>
        ) : (
          <textarea
            ref={inputRef}
            value={content}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              replyingTo
                ? `Répondre à @${replyingTo.author_name}...`
                : "Message..."
            }
            className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-zinc-100 placeholder-zinc-400 resize-none custom-scrollbar py-1 leading-snug"
            disabled={isUploading}
            rows={1}
            maxLength={2000}
            style={{ minHeight: "24px", maxHeight: "120px" }}
          />
        )}

        <div className="flex items-center gap-1 md:gap-2 relative shrink-0">
          {!isRecording && !content.trim() && (
            <button
              type="button"
              onClick={startRecording}
              className="text-zinc-400 hover:text-red-400 transition-colors flex items-center justify-center p-1"
              title="Envoyer un message vocal"
              disabled={isUploading}
            >
              <Mic className="w-5 h-5" />
            </button>
          )}

          {isRecording && (
            <button
              type="button"
              onClick={stopRecording}
              className="text-red-500 hover:text-red-400 transition-colors flex items-center justify-center p-1 scale-110"
              title="Arrêter et envoyer"
            >
              <StopCircle className="w-6 h-6" />
            </button>
          )}

          {!isRecording && (
            <>
              <button
                type="button"
                onClick={handleGifClick}
                className="text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center p-1"
                title="Ajouter un GIF"
                disabled={isUploading}
              >
                <ImageIcon className="w-5 h-5" />
              </button>

              {showGifPicker && (
                <GifPicker
                  onSelect={handleGifSelect}
                  onClose={() => setShowGifPicker(false)}
                />
              )}

              <div className="relative flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center p-1"
                  title="Ajouter un emoji"
                  disabled={isUploading}
                >
                  <SmilePlus className="w-5 h-5" />
                </button>

                {showEmojiPicker && (
                  <div className="absolute right-0 bottom-full mb-4 z-50">
                    <Suspense
                      fallback={
                        <div className="w-[300px] h-[350px] bg-zinc-800 rounded-lg flex items-center justify-center">
                          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                        </div>
                      }
                    >
                      <EmojiPicker
                        theme={"dark" as any}
                        onEmojiClick={handleEmojiClick}
                        lazyLoadEmojis={true}
                        height={350}
                        width={300}
                        customEmojis={serverEmojis.map((e) => ({
                          id: e.name,
                          names: [e.name],
                          imgUrl: e.url,
                        }))}
                      />
                    </Suspense>
                  </div>
                )}
              </div>
            </>
          )}

          {content.trim() && !isUploading && (
            <button
              type="submit"
              className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center justify-center p-1 ml-1"
            >
              <Send className="w-5 h-5" />
            </button>
          )}

          {isUploading && (
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin ml-1" />
          )}
        </div>
      </form>

      <PollModal
        isOpen={isPollModalOpen}
        onClose={() => setIsPollModalOpen(false)}
        onSubmit={(pollData) => sendPayload("", null, null, "poll", pollData)}
      />

      <PromptModal
        isOpen={promptConfig.isOpen}
        onClose={() => setPromptConfig((prev) => ({ ...prev, isOpen: false }))}
        onSubmit={promptConfig.onSubmit}
        title={promptConfig.title}
        inputLabel={promptConfig.label}
      />
    </div>
  );
}
