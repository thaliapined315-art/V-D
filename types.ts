export interface SearchSource {
  uri: string;
  title: string;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  isDiagnostic?: boolean;
  sources?: SearchSource[];
  audioUrl?: string; // Blob URL for TTS
}

export interface HardwareStats {
  cpuLoad: number;
  cpuTemp: number;
  gpuLoad: number;
  gpuTemp: number;
  ramUsed: number;
  ramTotal: number;
  diskUsed: number;
  diskTotal: number;
}

export enum AppView {
  HOME = 'HOME',
  MONITOR = 'MONITOR',
  CHAT = 'CHAT',
}

export enum ChatMode {
  FAST = 'FAST',
  PRO = 'PRO',
  SEARCH = 'SEARCH',
  THINKING = 'THINKING',
}