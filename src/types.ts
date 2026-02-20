export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice';
}

export interface Message {
  id: string;
  text: string;
  user: string;
  userId?: string;
  timestamp: string;
  reactions?: Record<string, string[]>; // emoji -> list of userIds
  gifUrl?: string;
}

export type Permission = 
  | 'MANAGE_CHANNELS'
  | 'MANAGE_ROLES'
  | 'SEND_MESSAGES'
  | 'CONNECT_VOICE'
  | 'ADMINISTRATOR';

export interface Role {
  id: string;
  name: string;
  color: string;
  permissions: Permission[];
}

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

export interface User {
  id: string;
  name: string;
  avatar?: string;
  roles?: string[]; // Role IDs
  status?: PresenceStatus;
}
