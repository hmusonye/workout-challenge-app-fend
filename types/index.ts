export type ChallengeStatus = "active" | "completed" | "archived";
export type TargetMode = "total" | "daily";
export interface Challenge { id:string; userId:string; name:string; activityName:string; activityLabelPlural:string; unitLabel:string; targetMode:TargetMode; targetReps:number; defaultRepsPerSet:number; quickSetSizes:number[]; activeWeekdays:number[]; startDate:string; endDate?:string; openingReps:number; status:ChallengeStatus; createdAt:string; updatedAt:string; }
export interface ExerciseSet { id:string; userId:string; challengeId:string; reps:number; performedAt:string; localDate:string; notes?:string; deletedAt?:string; deletedReason?:"undo"|"delete"; createdAt:string; updatedAt:string; syncStatus?:"pending"|"synced"|"error"; }
export interface UserSettings { id:string; userId:string; fallbackDefaultRepsPerSet:number; hapticsEnabled:boolean; weekStartsOn:0|1; theme:"system"|"light"|"dark"; onboardingComplete:boolean; }
export type AuditAction="create"|"update"|"undo"|"restore"|"delete"|"import"|"config_change";
export interface AuditEvent { id:string; userId:string; entityType:"exercise_set"|"challenge"|"settings"|"data_import"; entityId:string; action:AuditAction; beforeData:Record<string,unknown>|null; afterData:Record<string,unknown>|null; clientMutationId:string; occurredAt:string; recordedAt:string; requestId:string; ipAddress?:string; userAgent?:string; }
