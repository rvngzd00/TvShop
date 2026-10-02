import '@fastify/jwt';
import 'fastify';

export interface ActorContext {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: Set<string>;
  storeIds: string[];
  vendorIds: string[];
  isSuperAdmin: boolean;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; sessionId: string };
    user: { sub: string; sessionId: string };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    actor: ActorContext | null;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (permission: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
