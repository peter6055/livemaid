import NextAuth from "next-auth";
import { createAuthConfig } from "./config";

// Lazy init: Auth.js resolves providers once per config object, so a static
// config would freeze the OIDC credentials present at module load. The factory
// runs per request and reads the credentials stored at runtime.
export const { handlers, auth, signIn, signOut } = NextAuth(() => createAuthConfig());

export { type User, type Session } from "./config";
export { isAuthEnabled, areOidcCredentialsConfigured } from "./appConfig";
export {
  normalizeEmail,
  findOrCreateUser,
  createDefaultWorkspace,
  createAdminMembership,
  ensureDefaultWorkspace,
  type OidcProfile,
} from "./workspace";
export {
  AuthorizationError,
  getMembership,
  isAdmin,
  isMember,
  isUserActive,
  requireAdmin,
  requireMember,
  requireMemberRole,
} from "./permissions";
export { type AuditAction, hashIp, getClientIp, writeAuditLog } from "./audit";
export {
  inviteMember,
  acceptInviteByEmail,
  removeMember,
  updateMemberRole,
  setUserActive,
  getWorkspaceMembers,
  type WorkspaceMemberView,
} from "./invites";
