import type { AccessDirection, Role } from "./operations";

export type PlantScope = "ALL" | "PAG" | "CEB" | "DAV";
export type UserRecord = {
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  plant: PlantScope;
  direction: AccessDirection;
  active: boolean;
};
export type UsersDoc = { schemaVersion: number; revision: number; users: UserRecord[] };
export type SessionPayload = {
  email: string;
  name: string;
  role: Role;
  plant: PlantScope;
  direction: AccessDirection;
  exp: number;
};
export const publicUser = ({ passwordHash, ...rest }: UserRecord) => rest;
export type PublicUserRecord = Omit<UserRecord, "passwordHash">;
