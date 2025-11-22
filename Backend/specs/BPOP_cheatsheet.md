# BPOP Project Cheat Sheet

## Stack

- Backend: Node + TypeScript on Replit
  - Uses Supabase as Postgres + Auth
  - Key backend files:
    - /Backend/src/index.ts            -> main Express app
    - /Backend/src/routes/assessments.ts
    - /Backend/src/routes/coach.ts
    - /Backend/src/player.ts
    - /Backend/src/messaging.ts
    - /Backend/src/evalProgress.ts
    - /Backend/src/middleware/auth.ts  -> checks Supabase JWT
    - /Backend/src/scoring/*.ts        -> age-group-specific scoring
    - /Backend/src/SupabaseClient.ts   -> backend Supabase client

- Database: Supabase
  - Important tables:
    - profiles (id, role, display_name, first_name, last_name, birthdate, email, phone, avatar_url, bio)
    - teams (id, name, age_group, level, owner_id, logo_url, motto)
    - team_players (id, team_id, player_id, status, jersey_number, is_primary_team)
    - team_coaches, team_assistants
    - assessment_templates, assessment_metrics
    - eval_sessions
    - player_assessments, player_assessment_values
    - player_ratings (overall_score, offense_score, defense_score, pitching_score, breakdown jsonb)
    - medal_definitions, player_medals
    - trophy_definitions, team_trophies
    - batting_order_styles, batting_order_weights
    - pitching_configurations, pitching_configuration_slots
    - conversations, conversation_participants, messages, message_attachments
    - events, event_attendees

- Frontend: React + TypeScript + Vite (planned)
  - /frontend/src/api/client.ts       -> axios client using Supabase Auth token
  - /frontend/src/api/types.ts        -> shared TS types (Profile, Team, PlayerRating, etc.)
  - /frontend/src/supabaseClient.ts   -> Supabase client for frontend
  - Future structure:
    - /frontend/src/features/auth
    - /frontend/src/features/assessments
    - /frontend/src/features/teams
    - /frontend/src/features/batting
    - /frontend/src/features/pitching
    - /frontend/src/features/messaging
    - /frontend/src/features/events
    - /frontend/src/pages (route-level components)

## Key concepts

- Evaluations:
  - assessment_templates + assessment_metrics define age-group-specific tests.
  - eval_sessions group a set of player_assessments for a team.
  - player_assessment_values store raw metric values.
  - player_ratings store computed scores and breakdown.
  - Medals and trophies are awarded based on ratings thresholds.

- Optimization:
  - Batting order uses batting_order_styles + batting_order_weights per age group.
  - Pitching configs are saved in pitching_configurations (+ slots) and optimized by backend.
  - Fielding setups use position_hierarchies per age group.

- Auth:
  - Supabase Auth is source of truth.
  - Backend checks Supabase JWT in auth middleware.
  - Frontend will use @supabase/supabase-js and send access token in Authorization header.

