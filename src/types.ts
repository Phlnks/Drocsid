
export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

export type Channel = {
  id: string;
  name: string;
  type: 'text' | 'voice';
};

export interface Message {
  id: string;
  channelId: string;
  text: string;
  user: string;
  userId: string;
  timestamp: string;
  reactions: Record<string, string[]>;
  gifUrl?: string;
  linkPreview?: LinkPreview;
  file?: { path: string; name: string; size: number };
  edited?: string;
}

export interface User {
  id: string;
  name: string;
  avatar?: string;
  presence: PresenceStatus;
}

export type Permission = 
  | 'ADMINISTRATOR' 
  | 'MANAGE_CHANNELS' 
  | 'MANAGE_ROLES' 
  | 'KICK_MEMBERS'
  | 'SEND_MESSAGES' 
  | 'CONNECT_VOICE'
  | 'DELETE_MESSAGES'
  | 'EDIT_MESSAGES';

export interface Role {
  id: string;
  name: string;
  color: string;
  permissions: Permission[];
}

export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  image?: string;
}
