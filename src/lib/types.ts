export interface ButtonConfig {
  id: string;
  name: string;
  prefix: string;
  priority: number;
  frequency: number;
  color: string;
  textColor: string;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  type: string;
  prefix: string;
  timestamp: string;
  called: boolean;
  calledAt?: string;
  displayNumber: number;
  isRepeat?: boolean;
}

export interface AppSettings {
  buttons: ButtonConfig[];
  youtubeUrls: string[];
  priorityEnabled: boolean;
  counterConfiguration: 'none' | 'random' | 'selectable';
}
