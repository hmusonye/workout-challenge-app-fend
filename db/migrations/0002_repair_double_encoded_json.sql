-- Rows written between the jsonb fix and this release stored JSON as a jsonb *string* ("[5,20,25]")
-- instead of an array/object. Unwrap them in place; already-correct rows are untouched, so this is idempotent.
UPDATE "challenges" SET "quick_set_sizes" = ("quick_set_sizes" #>> '{}')::jsonb WHERE jsonb_typeof("quick_set_sizes") = 'string';--> statement-breakpoint
UPDATE "challenges" SET "active_weekdays" = ("active_weekdays" #>> '{}')::jsonb WHERE jsonb_typeof("active_weekdays") = 'string';--> statement-breakpoint
UPDATE "audit_events" SET "before_data" = ("before_data" #>> '{}')::jsonb WHERE jsonb_typeof("before_data") = 'string';--> statement-breakpoint
UPDATE "audit_events" SET "after_data" = ("after_data" #>> '{}')::jsonb WHERE jsonb_typeof("after_data") = 'string';
