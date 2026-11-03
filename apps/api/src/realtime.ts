import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { canUseAssistant, resolveAssistant } from '@street-smart/shared';
import { auditChat, authenticateKey } from './services/auth.js';
import { logSpaceActivity, requireSpaceContext, suggestSpace } from './services/spaceContext.js';
import { appendExchange, openConversation } from './services/conversations.js';
import { chatWithAI, type ChatStage } from './services/llm.js';

interface ChatMessagePayload {
  message?: string;
  sessionId?: string;
  assistantId?: string;
  role?: string;
  apiKey?: string;
  conversationId?: string;
  spaceId?: string;
}

const STAGE_LABEL: Record<ChatStage, string> = {
  tenders: 'Searching tender database',
  docs: 'Reading relevant documents',
  ai: 'Generating answer',
  done: 'Done',
};

/** Socket.IO realtime layer. Events (client ↔ server):
 *  → `auth` { apiKey? }                        (gabung room milik sendiri; mgmt juga room management)
 *  ← `auth:ok` { user } / `auth:error` { error }
 *  → `chat:message` { message, sessionId?, assistantId?, apiKey?, conversationId?, spaceId? }
 *  ← `chat:stage`   { stage, label }            (progress, realtime)
 *  ← `chat:answer`  { ...result, via, dataVia } (final payload, same shape as POST /api/chat)
 *  ← `chat:error`   { error }                   (termasuk 'unauthorized' / 'forbidden')
 *  ← `draft:changed` { id, status }            (HANYA ke pemilik draft + management)
 *  POST /api/chat stays available as fallback (same service, no stages).
 *  Tanpa `auth` yang valid, socket tidak menerima event draft apa pun.
 */

let ioRef: Server | null = null;

export const MGMT_ROOM = 'role:management';
export const userRoom = (userId: string): string => `user:${userId}`;

/** Room tujuan event draft: pemilik + management. Draft lama tanpa pemilik
 * hanya ke management (jangan bocor ke semua socket). Pure — bisa di-unit-test. */
export function draftRooms(createdBy?: string | null): string[] {
  return createdBy ? [userRoom(createdBy), MGMT_ROOM] : [MGMT_ROOM];
}

/** Emit perubahan draft HANYA ke pemilik + management — payload minimal (tanpa body).
 * Socket anonim / role lain tidak menerima apa pun. */
export function emitDraftChanged(draft: { id: string; status: string; createdBy?: string | null }): void {
  try {
    const io = ioRef;
    if (!io) return;
    for (const room of draftRooms(draft.createdBy ?? undefined)) {
      io.to(room).emit('draft:changed', { id: draft.id, status: draft.status });
    }
  } catch { /* abaikan — realtime best-effort, REST tetap sumber kebenaran */ }
}
export function initRealtime(httpServer: HttpServer, corsOrigin: string): Server {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  });

  ioRef = io;

  io.on('connection', (socket) => {
    // Auth per koneksi untuk event push (draft). Chat tetap auth per pesan via apiKey.
    socket.on('auth', async (payload: { apiKey?: string }) => {
      try {
        const prev = (socket.data as { userId?: string }).userId;
        if (prev) {
          await socket.leave(userRoom(prev));
          await socket.leave(MGMT_ROOM);
        }
        const user = await authenticateKey(String(payload?.apiKey ?? ''));
        if (!user) {
          (socket.data as { userId?: string }).userId = undefined;
          socket.emit('auth:error', { error: 'unauthorized' });
          return;
        }
        (socket.data as { userId?: string }).userId = user.id;
        await socket.join(userRoom(user.id));
        if (user.role === 'management') await socket.join(MGMT_ROOM);
        socket.emit('auth:ok', { user: { id: user.id, name: user.name, role: user.role } });
      } catch {
        socket.emit('auth:error', { error: 'auth failed' });
      }
    });
    socket.on('chat:message', async (payload: ChatMessagePayload) => {
      const message = String(payload?.message ?? '').slice(0, 4000);
      if (!message.trim()) {
        socket.emit('chat:error', { error: 'message is required' });
        return;
      }
      // Role dari sesi terautentikasi — field `role` dari client diabaikan (cegah spoofing).
      const user = await authenticateKey(String(payload?.apiKey ?? ''));
      if (!user) {
        socket.emit('chat:error', { error: 'unauthorized: missing or invalid apiKey' });
        return;
      }
      const resolved = resolveAssistant({ assistantId: payload.assistantId, role: user.role, message });
      if (!canUseAssistant(user.role, resolved.id)) {
        socket.emit('chat:error', { error: `forbidden: assistant '${resolved.id}' not available for role '${user.role}'` });
        return;
      }
      const spaceId = typeof (payload as { spaceId?: unknown }).spaceId === 'string' && (payload as { spaceId: string }).spaceId
        ? (payload as { spaceId: string }).spaceId.slice(0, 64)
        : undefined;
      let spaceContext: Awaited<ReturnType<typeof requireSpaceContext>> | null = null;
      if (spaceId) {
        try {
          spaceContext = await requireSpaceContext(spaceId, { id: user.id, role: user.role });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'space context unavailable';
          socket.emit('chat:error', { error: msg });
          return;
        }
      }
      try {
        const result = await chatWithAI(message, {
          assistantId: resolved.id,
          role: user.role,
          userId: user.id,
          sessionId: typeof payload.sessionId === 'string' ? payload.sessionId.slice(0, 64) : undefined,
          onStage: (stage) => socket.emit('chat:stage', { stage, label: STAGE_LABEL[stage] }),
          spaceContext,
        });
        void auditChat({ user, assistantId: result.assistantId ?? resolved.id, message, via: result.via, spaceId: spaceContext?.spaceId });
        if (spaceContext) {
          void logSpaceActivity({
            spaceId: spaceContext.spaceId, actorId: user.id, actorRole: user.role,
            type: 'CONTEXT_USED', summary: `Chat used space "${spaceContext.name}" as context`,
          });
        }
        let suggestedSpace: Awaited<ReturnType<typeof suggestSpace>> = null;
        try {
          const s = await suggestSpace({
            viewer: { id: user.id, role: user.role },
            message,
            tenderIds: result.tenderIds ?? [],
          });
          if (s && s.spaceId !== (spaceContext?.spaceId ?? null)) suggestedSpace = s;
        } catch {
          suggestedSpace = null;
        }
        let cid = typeof payload.conversationId === 'string' ? payload.conversationId.slice(0, 64) : undefined;
        if (cid) {
          const ok = await appendExchange({ conversationId: cid, userId: user.id, role: user.role, question: message, answer: result });
          if (!ok) cid = undefined;
        }
        if (!cid) {
          cid = (await openConversation({ userId: user.id, assistantId: result.assistantId ?? resolved.id, title: message })) ?? undefined;
          if (cid) await appendExchange({ conversationId: cid, userId: user.id, role: user.role, question: message, answer: result });
        }
        socket.emit('chat:answer', { ...result, conversationId: cid ?? null, spaceId: spaceContext?.spaceId ?? null, suggestedSpace });
      } catch (err) {
        socket.emit('chat:error', { error: (err as Error).message });
      }
    });
  });

  return io;
}
