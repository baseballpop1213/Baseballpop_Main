# Baseball Performance Optimization Program (BPOP)

## Overview
A full-stack Baseball Performance Optimization Program with a React frontend and Express backend, providing tools for managing baseball performance data, coaching, player assessments, and team messaging.

**Technology Stack:**
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, React Router
- **Backend:** Node.js with Express, TypeScript
- **Database/Auth:** Supabase (PostgreSQL + Authentication)
- CORS enabled for cross-origin requests

## Project Status
**Last Updated:** December 02, 2024

The project is fully set up in the Replit environment with:
- Frontend running on port 5000 (webview)
- Backend API running on port 3000

## Project Structure
```
├── frontend/                    # React frontend application
│   ├── src/
│   │   ├── api/                # API client functions
│   │   ├── components/         # Reusable UI components
│   │   ├── context/            # React contexts (Auth)
│   │   ├── hooks/              # Custom React hooks
│   │   ├── layouts/            # Page layouts
│   │   ├── pages/              # Page components
│   │   │   ├── Auth/           # Login page
│   │   │   ├── Dashboard/      # Main dashboard
│   │   │   ├── Stats/          # Statistics view
│   │   │   ├── Messages/       # Messaging feature
│   │   │   ├── Events/         # Events calendar
│   │   │   ├── Profile/        # User profile
│   │   │   └── Assessments/    # Player assessments
│   │   ├── App.tsx             # Main App component with routing
│   │   ├── main.tsx            # Application entry point
│   │   └── supabaseClient.ts   # Supabase client configuration
│   ├── vite.config.ts          # Vite configuration
│   └── package.json
│
├── Backend/                     # Express API server
│   ├── src/
│   │   ├── index.ts            # Main Express server
│   │   ├── supabaseClient.ts   # Supabase client configuration
│   │   ├── middleware/
│   │   │   └── auth.ts         # JWT authentication middleware
│   │   └── routes/
│   │       ├── assessments.ts  # Player assessment endpoints
│   │       ├── coach.ts        # Coach management endpoints
│   │       ├── feed.ts         # Feed/posts endpoints
│   │       ├── messaging.ts    # Messaging endpoints
│   │       └── player.ts       # Player data endpoints
│   ├── package.json
│   └── tsconfig.json
│
└── replit.md                    # This file
```

## Frontend Pages
- `/login` - User login page
- `/` - Dashboard (protected)
- `/stats` - Statistics view (protected)
- `/messages` - Messaging (protected)
- `/events` - Events calendar (protected)
- `/profile` - User profile (protected)
- `/assessments/start` - Start new assessment (protected)
- `/assessments/:sessionId` - Assessment session (protected)

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
- `GET /api/messaging/conversations/:id/messages` - Get messages (authenticated)
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
- Frontend uses Supabase Auth for user authentication
- Backend validates JWT tokens in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Environment Variables

### Frontend (via Secrets)
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key (browser-safe)
- `VITE_API_BASE_URL` - Backend API URL

### Backend (via Secrets)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `SUPABASE_JWT_SECRET` - JWT secret for token verification

## Development Workflows

### Frontend (Start application)
- **Command:** `cd frontend && npm run dev`
- **Port:** 5000 (webview)
- **Output:** Web preview

### Backend (backend-server)
- **Command:** `cd Backend && npm run dev`
- **Port:** 3000
- **Output:** Console

## Recent Changes
- **December 02, 2024:** Environment setup completed
  - Fixed corrupted AuthContext.tsx file
  - Updated Vite configuration for Replit environment
  - Configured allowedHosts for proper preview access
  - Both frontend and backend servers running successfully

- **November 17, 2024:** Initial project setup in Replit environment

## Troubleshooting
- If the workspace fails to open after a merge, clear cached build artifacts and reinstall dependencies:
  ```bash
  rm -rf node_modules frontend/node_modules Backend/node_modules frontend/dist Backend/dist
  npm install --prefix Backend
  npm install --prefix frontend
  ```
- For preview issues, ensure Vite has `allowedHosts: true` in the server config
