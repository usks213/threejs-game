// Contract for the subsequent WebRTC/Colyseus adapters. No network is enabled yet.
export interface SessionTransport {
  connect(): Promise<void>;
  disconnect(): void;
  sendReliable(peer: string, packet: Uint8Array): void;
  sendRealtime(peer: string, packet: Uint8Array): void;
  broadcastReliable(packet: Uint8Array): void;
  broadcastRealtime(packet: Uint8Array): void;
  onMessage(handler: (peer: string, packet: Uint8Array) => void): () => void;
  onPeerJoin(handler: (peer: string) => void): () => void;
  onPeerLeave(handler: (peer: string) => void): () => void;
  getStats(): { peers: number; sentBytes: number; receivedBytes: number };
}
