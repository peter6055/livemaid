import NextAuth from "next-auth";
import { authConfig } from "./config";

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

export { authConfig, isAuthEnabled, assertAuthConfigured, type User, type Session } from "./config";
export {
  normalizeEmail,
  findOrCreateUser,
  createDefaultWorkspace,
  createAdminMembership,
  ensureDefaultWorkspace,
  type OidcProfile,
} from "./workspace";
export {
  adoptLegacyDiagrams,
  markLegacyAdoptionComplete,
  isLegacyAdoptionComplete,
  runLegacyAdoptionIfNeeded,
} from "./migration";
export {
  AuthorizationError,
  getMembership,
  isAdmin,
  isMember,
  requireAdmin,
  requireMember,
} from "./permissions";
export { type AuditAction, hashIp, getClientIp, writeAuditLog } from "./audit";
export {
  inviteMember,
  acceptInviteByEmail,
  removeMember,
  updateMemberRole,
  getWorkspaceMembers,
} from "./invites";
