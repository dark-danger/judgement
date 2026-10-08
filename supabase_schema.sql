-- 🔥 AGRASH Judgement Portal - Supabase SQL Schema
-- Run this in your Supabase Project -> SQL Editor

-- 1. Create Events Table
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    judge_count INT DEFAULT 5,
    judges JSONB DEFAULT '[]'::jsonb,
    criteria JSONB DEFAULT '[]'::jsonb,
    sequence JSONB DEFAULT '[]'::jsonb,
    completed_tags JSONB DEFAULT '[]'::jsonb,
    current_index INT DEFAULT 0,
    next_transition_time DOUBLE PRECISION,
    transition_seconds INT DEFAULT 120,
    google_sheet_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Scores Table
CREATE TABLE IF NOT EXISTS scores (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    tag_no TEXT NOT NULL,
    judge_id TEXT NOT NULL,
    judge_name TEXT,
    scores JSONB DEFAULT '{}'::jsonb,
    total NUMERIC(5, 2) DEFAULT 0,
    remarks TEXT,
    admin_overridden BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable Row Level Security (RLS) - Allow public reads and writes for judges & organizers
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on events" ON events FOR SELECT USING (true);
CREATE POLICY "Allow public write on events" ON events FOR ALL USING (true);

CREATE POLICY "Allow public read on scores" ON scores FOR SELECT USING (true);
CREATE POLICY "Allow public write on scores" ON scores FOR ALL USING (true);

-- Enable Realtime for live judge & sequence updates
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
