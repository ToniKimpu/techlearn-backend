export const ROLES = {
  admin: "admin",
  teacher: "teacher",
  student: "student",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  "curriculum:write": [ROLES.admin],
  "grade:write": [ROLES.admin],
  "subject:write": [ROLES.admin],
  "chapter:write": [ROLES.admin],
  "email:admin": [ROLES.admin],
} as const;

export type Permission = keyof typeof PERMISSIONS;
