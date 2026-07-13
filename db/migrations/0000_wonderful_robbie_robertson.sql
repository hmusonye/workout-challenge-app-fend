CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before_data" jsonb,
	"after_data" jsonb,
	"client_mutation_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" uuid NOT NULL,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"activity_name" text NOT NULL,
	"activity_label_plural" text NOT NULL,
	"unit_label" text NOT NULL,
	"target_mode" text NOT NULL,
	"target_reps" integer NOT NULL,
	"default_reps_per_set" integer NOT NULL,
	"quick_set_sizes" jsonb NOT NULL,
	"active_weekdays" jsonb NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"opening_reps" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"challenge_id" uuid NOT NULL,
	"reps" integer NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"local_date" text NOT NULL,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"deleted_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"email" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"successful" boolean DEFAULT false NOT NULL,
	CONSTRAINT "login_attempts_email_attempted_at_pk" PRIMARY KEY("email","attempted_at")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"fallback_default_reps_per_set" integer DEFAULT 10 NOT NULL,
	"haptics_enabled" boolean DEFAULT true NOT NULL,
	"week_starts_on" integer DEFAULT 1 NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_sets" ADD CONSTRAINT "exercise_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_sets" ADD CONSTRAINT "exercise_sets_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_user_mutation_unique" ON "audit_events" USING btree ("user_id","client_mutation_id");--> statement-breakpoint
CREATE INDEX "audit_lookup_idx" ON "audit_events" USING btree ("user_id","entity_type","entity_id","recorded_at");--> statement-breakpoint
CREATE INDEX "challenges_user_idx" ON "challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "challenges_user_status_idx" ON "challenges" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "sets_user_date_idx" ON "exercise_sets" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "sets_user_challenge_idx" ON "exercise_sets" USING btree ("user_id","challenge_id");--> statement-breakpoint
CREATE INDEX "sets_challenge_time_idx" ON "exercise_sets" USING btree ("challenge_id","performed_at");