import type { Capability } from './permissions';
export type AppUser = { id:string; username:string; name:string; isActive:boolean; permissions:Capability[]; owner:boolean; createdAt:string; updatedAt:string };
export type Principal = { principalType:'local'; name:string; permissions:Capability[] } | { principalType:'owner'; userId:string; name:string; username:string; permissions:Capability[] } | { principalType:'user'; userId:string; name:string; username:string; permissions:Capability[] };
