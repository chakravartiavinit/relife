CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"received_bytes" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"signature" text,
	"mapping" jsonb,
	"progress" jsonb DEFAULT '{"phase":"upload","done":0}'::jsonb NOT NULL,
	"summary" jsonb DEFAULT '{"rows":0,"added":0,"duplicates":0,"invalid":0,"invalidSamples":[]}'::jsonb NOT NULL,
	"error" text,
	"finished_at" timestamp with time zone,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "linked_to" uuid;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "imports_user_created" ON "imports" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "imports_user_signature" ON "imports" USING btree ("user_id","signature");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_linked_to_transactions_id_fk" FOREIGN KEY ("linked_to") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_linked_to" ON "transactions" USING btree ("linked_to") WHERE "transactions"."linked_to" is not null;