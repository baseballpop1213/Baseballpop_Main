# Baseball Performance Optimization Program (BPOP) Backend

## Overview
This is the backend API for the Baseball Performance Optimization Program, providing RESTful endpoints for managing baseball performance data, coaching, player assessments, and team messaging.

**Technology Stack:**
- Node.js with Express
- TypeScript for type safety
- Supabase (PostgreSQL + Authentication)
- CORS enabled for cross-origin requests

## Project Status
**Last Updated:** November 17, 2024

The project has been successfully set up in the Replit environment with all core functionality implemented and the backend server running on port 3000.

## Project Structure
```
Backend/
├── src/
│   ├── index.ts                 # Main Express server
│   ├── supabaseClient.ts        # Supabase client configuration
│   ├── middleware/
│   │   └── auth.ts              # JWT authentication middleware
│   └── routes/
│       ├── assessments.ts       # Player assessment endpoints
│       ├── coach.ts             # Coach management endpoints
│       ├── feed.ts              # Feed/posts endpoints
│       ├── messaging.ts         # Messaging/conversations endpoints
│       └── player.ts            # Player data endpoints
├── package.json
├── tsconfig.json
└── .env                         # Environment variables (not in git)
```

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Coaches
- `GET /api/coaches` - List all coaches
- `GET /api/coaches/:id` - Get specific coach

### Feed
- `GET /api/feed` - Get feed posts (authenticated)
- `POST /api/feed` - Create new feed post (authenticated)

### Messaging
- `GET /api/messaging/conversations` - Get user conversations (authenticated)
- `GET /api/messaging/conversations/:id/messages` - Get messages for a conversation (authenticated)
- `POST /api/messaging/messages` - Send a message (authenticated)

### Assessments
- `GET /api/assessments` - Get user assessments (authenticated)
- `GET /api/assessments/:id` - Get specific assessment (authenticated)
- `POST /api/assessments` - Create new assessment (authenticated)

### Players
- `GET /api/players` - List all players (authenticated)
- `GET /api/players/:id` - Get specific player (authenticated)
- `PUT /api/players/:id` - Update player data (authenticated)

## Authentication
Most endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Environment Variables
The following environment variables are configured in `Backend/.env`:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `SUPABASE_JWT_SECRET` - JWT secret for token verification
- `PORT` - Server port (default: 3000)

## Development

### Running the Server
The backend server runs automatically via the configured workflow:
- **Workflow Name:** backend-server
- **Command:** `cd Backend && npm run dev`
- **Port:** 3000
- **Status:** Console output (backend only, no UI)

### Available Scripts
```bash
npm run dev      # Run development server with ts-node
npm run build    # Compile TypeScript to JavaScript
npm start        # Run production server
npm run watch    # Run with auto-reload on changes
```

### Database Schema
The backend expects the following Supabase tables:
- `coaches` - Coach profiles
- `players` - Player profiles and stats
- `feed` - Feed posts and updates
- `conversations` - Message conversations
- `messages` - Individual messages
- `assessments` - Player performance assessments

## Recent Changes
- **November 17, 2024:** Initial project setup in Replit environment
  - Created complete backend structure from imported repository
  - Implemented all route handlers with Supabase integration
  - Configured authentication middleware
  - Set up TypeScript compilation
  - Configured workflow for automatic server startup
  - Server successfully running on port 3000

## Notes
- This is a backend-only project (no frontend)
- Backend binds to localhost:3000 (internal port)
- All routes use Supabase for data persistence
- Authentication is handled via Supabase Auth with JWT tokens
