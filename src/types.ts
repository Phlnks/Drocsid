
export type Channel = {
  id: string;
  name: string;
  type: 'text' | 'voice';
};

export interface Message {
  id: string;
  text: string;
  user: string;
  userId?: string;
  timestamp: string;
  reactions?: Record<string, string[]>; // emoji -> userIds
  gifUrl?: string;
  file?: {
    name: string;
    url: string;
  };
  linkPreview?: LinkPreview;
}

export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  image?: string;
}

export interface User {
  id: string;
  name: string;
}

export type Permission =
  | 'ADMINISTRATOR'
  | 'MANAGE_CHANNELS'
  | 'MANAGE_ROLES'
  | 'SEND_MESSAGES'
  | 'CONNECT_VOICE';

export interface Role {
  id: string;
  name: string;
  color: string;
  permissions: Permission[];
}

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';
