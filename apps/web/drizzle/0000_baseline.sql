CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"institution" text,
	"currency" text DEFAULT 'INR' NOT NULL,
	"latest_balance" numeric(20,8),
	"balance_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"app" text,
	"domain" text,
	"path" text,
	"title" text,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"seconds" integer NOT NULL,
	"local_date" date NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ref" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"kind" text NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"local_date" date NOT NULL,
	"text" text NOT NULL,
	"why" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"occurrence" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"status" text NOT NULL,
	"value" numeric(20,8),
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rarity" text NOT NULL,
	"reason" text NOT NULL,
	"ref" text NOT NULL,
	"xp" integer NOT NULL,
	"freeze" boolean DEFAULT false NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "coach_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"channel" text DEFAULT 'app' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connector_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cursor" jsonb,
	"secrets_encrypted" "bytea",
	"last_sync_at" timestamp with time zone,
	"status" text DEFAULT 'never' NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"asset" text NOT NULL,
	"amount" numeric(20,8) NOT NULL,
	"usd" numeric(20,8),
	"symbol" text,
	"source" text NOT NULL,
	"external_ref" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"scopes" text[] NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"via" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tracker_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"value" numeric(20,8) NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"note" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"date" date NOT NULL,
	"quote" text NOT NULL,
	"rate" numeric(20,8) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"value" numeric(20,8) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"kind" text NOT NULL,
	"review_date" date NOT NULL,
	"snapshot" jsonb NOT NULL,
	"proposal" jsonb,
	"ai_note" text,
	"decision" text,
	"decided_at" timestamp with time zone,
	"note" text,
	"before" jsonb,
	"after" jsonb,
	"insight_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"area" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"measure_kind" text NOT NULL,
	"tracker_id" uuid,
	"measure_name" text NOT NULL,
	"unit" text,
	"direction" text NOT NULL,
	"target" numeric(20,8),
	"range_low" numeric(20,8),
	"range_high" numeric(20,8),
	"baseline_value" numeric(20,8) NOT NULL,
	"baseline_date" date NOT NULL,
	"baseline_how" text NOT NULL,
	"baseline_observations" integer,
	"target_date" date NOT NULL,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"next_review_on" date NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"insight_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"paused_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "heartbeats" (
	"name" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"asset" text NOT NULL,
	"qty" numeric(20,8) NOT NULL,
	"price_usd" numeric(20,8),
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency" (
	"device_id" uuid NOT NULL,
	"key" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"next_run_at" timestamp with time zone,
	"requested_at" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"locked_by" text,
	"last_ok" boolean,
	"last_result" text,
	"failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"provider" text,
	"url" text,
	"cost" numeric(20,8),
	"currency" text,
	"status" text DEFAULT 'active' NOT NULL,
	"kind" text DEFAULT 'course' NOT NULL,
	"image" text,
	"last_active_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"progress_done" integer DEFAULT 0 NOT NULL,
	"progress_total" integer,
	"minutes_logged" integer DEFAULT 0 NOT NULL,
	"target_date" date,
	"schedule_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text,
	"number" integer,
	"season" integer,
	"duration_sec" integer,
	"position_sec" integer,
	"watched_sec" integer DEFAULT 0 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"ms" integer,
	"ok" boolean NOT NULL,
	"request" jsonb,
	"response" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pattern" text NOT NULL,
	"merchant" text NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_worth_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"currency" text,
	"total" numeric(20,8) NOT NULL,
	"cash" numeric(20,8) NOT NULL,
	"crypto" numeric(20,8) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"text" text NOT NULL,
	"buttons" jsonb,
	"ref" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"send_after" timestamp with time zone DEFAULT now() NOT NULL,
	"sends" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone,
	"message_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"method" text NOT NULL,
	"secret_hash" "bytea" NOT NULL,
	"user_code" text,
	"kind" text,
	"device_name" text,
	"scopes" text[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by_device_id" uuid,
	"device_id" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relation" text,
	"contact_every_days" integer,
	"last_contacted_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal" text NOT NULL,
	"horizon" text,
	"status" text DEFAULT 'active' NOT NULL,
	"insight_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"body" jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"parser_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"occurrence" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"telegram_message_id" integer,
	"snoozed_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"rrule" text NOT NULL,
	"remind_offset_min" integer DEFAULT 0 NOT NULL,
	"target" numeric(20,8),
	"unit" text,
	"amount" numeric(20,8),
	"currency" text,
	"active" boolean DEFAULT true NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streak_freezes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"error" text,
	"events_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"stat_id" text NOT NULL,
	"stat_name" text NOT NULL,
	"area" text NOT NULL,
	"unit" text,
	"op" text NOT NULL,
	"agg" text NOT NULL,
	"target" numeric(20,8) NOT NULL,
	"baseline" numeric(20,8),
	"rank" text NOT NULL,
	"xp" integer NOT NULL,
	"title" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'active' NOT NULL,
	"progress" numeric(20,8),
	"parent_id" uuid,
	"ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trackers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"kind" text DEFAULT 'number' NOT NULL,
	"unit" text,
	"target" numeric(20,8),
	"direction" text DEFAULT 'up' NOT NULL,
	"aggregate" text DEFAULT 'sum' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid,
	"at" timestamp with time zone NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"qty" numeric(20,8) NOT NULL,
	"price" numeric(20,8) NOT NULL,
	"fee" numeric(20,8) DEFAULT 0 NOT NULL,
	"fee_asset" text,
	"kind" text DEFAULT 'spot' NOT NULL,
	"source" text NOT NULL,
	"external_ref" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid,
	"at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"amount" numeric(20,8) NOT NULL,
	"currency" text NOT NULL,
	"merchant" text,
	"upi_id" text,
	"category" text,
	"source" text NOT NULL,
	"external_ref" text NOT NULL,
	"raw_event_id" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"base_currency" text DEFAULT 'INR' NOT NULL,
	"email" text,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"area" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"amount" integer NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"reason" text,
	"ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_rules" ADD CONSTRAINT "activity_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chests" ADD CONSTRAINT "chests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_messages" ADD CONSTRAINT "coach_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_flows" ADD CONSTRAINT "crypto_flows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_flows" ADD CONSTRAINT "crypto_flows_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_tracker_id_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_check_ins" ADD CONSTRAINT "goal_check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_check_ins" ADD CONSTRAINT "goal_check_ins_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_reviews" ADD CONSTRAINT "goal_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_reviews" ADD CONSTRAINT "goal_reviews_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_reviews" ADD CONSTRAINT "goal_reviews_insight_id_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."insights"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_tracker_id_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."trackers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_insight_id_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."insights"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_episodes" ADD CONSTRAINT "library_episodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_episodes" ADD CONSTRAINT "library_episodes_item_id_learning_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."learning_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_rules" ADD CONSTRAINT "merchant_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairings" ADD CONSTRAINT "pairings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_insight_id_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."insights"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_events" ADD CONSTRAINT "raw_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_freezes" ADD CONSTRAINT "streak_freezes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_quests" ADD CONSTRAINT "system_quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_key" ON "accounts" USING btree ("user_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "achievements_user_key" ON "achievements" USING btree ("user_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_user_ref" ON "activity" USING btree ("user_id","ref");--> statement-breakpoint
CREATE INDEX "activity_user_date" ON "activity" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_rules_user_domain" ON "activity_rules" USING btree ("user_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "briefs_user_scope_date" ON "briefs" USING btree ("user_id","scope","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "checks_schedule_occ" ON "checks" USING btree ("schedule_id","occurrence");--> statement-breakpoint
CREATE UNIQUE INDEX "chests_user_ref" ON "chests" USING btree ("user_id","ref");--> statement-breakpoint
CREATE INDEX "coach_messages_user_created" ON "coach_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_user_connector" ON "connections" USING btree ("user_id","connector_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crypto_flows_source_ref" ON "crypto_flows" USING btree ("user_id","source","external_ref");--> statement-breakpoint
CREATE INDEX "crypto_flows_user_at" ON "crypto_flows" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "crypto_flows_user_updated" ON "crypto_flows" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_token_hash" ON "devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "devices_user" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entries_tracker_date_source" ON "entries" USING btree ("tracker_id","local_date","source");--> statement-breakpoint
CREATE INDEX "entries_user_date" ON "entries" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "entries_user_updated" ON "entries" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_date_quote" ON "fx_rates" USING btree ("date","quote");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_check_ins_goal_date" ON "goal_check_ins" USING btree ("goal_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_reviews_user_ref" ON "goal_reviews" USING btree ("user_id","ref");--> statement-breakpoint
CREATE INDEX "goal_reviews_goal_date" ON "goal_reviews" USING btree ("goal_id","review_date");--> statement-breakpoint
CREATE INDEX "goals_user_status" ON "goals" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_account_asset" ON "holdings" USING btree ("account_id","asset");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_pk" ON "idempotency" USING btree ("device_id","key");--> statement-breakpoint
CREATE INDEX "insights_user_status" ON "insights" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "library_episodes_item_key" ON "library_episodes" USING btree ("item_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_rules_user_pattern" ON "merchant_rules" USING btree ("user_id","pattern");--> statement-breakpoint
CREATE UNIQUE INDEX "net_worth_user_date" ON "net_worth_snapshots" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "notifications_user_status" ON "notifications" USING btree ("user_id","status","send_after");--> statement-breakpoint
CREATE INDEX "notifications_message" ON "notifications" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pairings_secret" ON "pairings" USING btree ("secret_hash");--> statement-breakpoint
CREATE INDEX "pairings_code" ON "pairings" USING btree ("user_code");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_events_source_ext" ON "raw_events" USING btree ("user_id","source","external_id");--> statement-breakpoint
CREATE INDEX "raw_events_status" ON "raw_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "raw_events_queue" ON "raw_events" USING btree ("user_id","status","at");--> statement-breakpoint
CREATE INDEX "raw_events_source_type_at" ON "raw_events" USING btree ("user_id","source",("body"->>'type'),"at");--> statement-breakpoint
CREATE INDEX "raw_events_user_updated" ON "raw_events" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_schedule_occ" ON "reminders" USING btree ("schedule_id","occurrence");--> statement-breakpoint
CREATE UNIQUE INDEX "streak_freezes_user_date" ON "streak_freezes" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "sync_runs_connector_started" ON "sync_runs" USING btree ("connector_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "system_quests_user_ref" ON "system_quests" USING btree ("user_id","ref");--> statement-breakpoint
CREATE INDEX "system_quests_user_status" ON "system_quests" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "trackers_user_slug" ON "trackers" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "trades_source_ref" ON "trades" USING btree ("user_id","source","external_ref");--> statement-breakpoint
CREATE INDEX "trades_user_updated" ON "trades" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_source_ref" ON "transactions" USING btree ("user_id","source","external_ref");--> statement-breakpoint
CREATE INDEX "transactions_user_date" ON "transactions" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "transactions_user_updated" ON "transactions" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "transactions_uncategorized" ON "transactions" USING btree ("user_id") WHERE "transactions"."category" = 'Uncategorized';--> statement-breakpoint
CREATE UNIQUE INDEX "users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_events_user_ref" ON "xp_events" USING btree ("user_id","ref");--> statement-breakpoint
CREATE INDEX "xp_events_user_date" ON "xp_events" USING btree ("user_id","local_date");