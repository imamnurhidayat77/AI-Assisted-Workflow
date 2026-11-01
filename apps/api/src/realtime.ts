import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { chatWithAI, type ChatStage } from './services/llm.js';

interface ChatMessagePayload {
  message?: string;
  sessionId?: string;
  assistantId?: string;
  role?: string;
}

const STAGE_LABEL: Record<ChatStage, string> = {
  tenders: 'Searching tender database',
  docs: 'Reading relevant documents',
  ai: 'Generating answer',
  done: 'Done',
};

/** Socket.IO realtime layer. Events (client ↔ server):
 *  → `chat:message` { message, sessionId?, assistantId?, role? }
 *  ← `chat:stage`   { stage, label }            (progress, realtime)
 *  ← `chat:answer`  { ...result, via, dataVia } (final payload, same shape as POST /api/chat)
 *  ← `chat:error`   { error }
 *  POST /api/chat stays available as fallback (same service, no stages).
 */
export function initRealtime(httpServer: HttpServer, corsOrigin: string): Server {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    socket.on('chat:message', async (payload: ChatMessagePayload) => {
      const message = String(payload?.message ?? '').slice(0, 4000);
      if (!message.trim()) {
        socket.emit('chat:error', { error: 'message is required' });
        return;
      }
      try {
        const result = await chatWithAI(message, {
          assistantId: payload.assistantId,
          role: payload.role as never,
          sessionId: typeof payload.sessionId === 'string' ? payload.sessionId.slice(0, 64) : undefined,
          onStage: (stage) => socket.emit('chat:stage', { stage, label: STAGE_LABEL[stage] }),
        });
        socket.emit('chat:answer', result);
      } catch (err) {
        socket.emit('chat:error', { error: (err as Error).message });
      }
    });
  });

  return io;
}
