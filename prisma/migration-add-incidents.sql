-- ============================================================================
-- Migration: Create incidents and incident_logs tables
-- For the new Incident domain (Requirements 32.x)
-- ============================================================================

-- Enum types (PostgreSQL)
DO $$ BEGIN
  CREATE TYPE "IncidentSeverity" AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IncidentCategory" AS ENUM ('theft', 'vandalism', 'trespassing', 'fire', 'flood', 'suspicious_activity', 'noise_complaint', 'device_alert', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IncidentStatus" AS ENUM ('open', 'acknowledged', 'in_progress', 'escalated', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- incidents table
CREATE TABLE IF NOT EXISTS "incidents" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "severity" "IncidentSeverity" NOT NULL,
  "category" "IncidentCategory" NOT NULL,
  "status" "IncidentStatus" NOT NULL DEFAULT 'open',
  "reported_by" TEXT NOT NULL,
  "assigned_to" TEXT,
  "evidence_urls" TEXT[] DEFAULT '{}',
  "escalated_at" TIMESTAMP(3),
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "incidents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "incidents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);

CREATE INDEX IF NOT EXISTS "incidents_tenant_id_status_idx" ON "incidents"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "incidents_tenant_id_severity_idx" ON "incidents"("tenant_id", "severity");
CREATE INDEX IF NOT EXISTS "incidents_tenant_id_created_at_idx" ON "incidents"("tenant_id", "created_at");

-- incident_logs table
CREATE TABLE IF NOT EXISTS "incident_logs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "incident_id" TEXT NOT NULL,
  "status" "IncidentStatus" NOT NULL,
  "notes" TEXT,
  "actor_id" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "incident_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "incident_logs_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id")
);

CREATE INDEX IF NOT EXISTS "incident_logs_incident_id_timestamp_idx" ON "incident_logs"("incident_id", "timestamp");
