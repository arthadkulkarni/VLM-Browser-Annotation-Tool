# Browser Annotation Tool

A web application for video annotation and query management with support for timestamped annotations. Built with Flask (backend) and React (frontend) with PostgreSQL database.

## Prerequisites

Before running this project, make sure you have the following installed:

- **Python 3.8+** - [Download](https://www.python.org/downloads/)
- **Node.js 16+** and npm - [Download](https://nodejs.org/)
- **PostgreSQL** - [Download](https://www.postgresql.org/download/)
- **Git** - [Download](https://git-scm.com/)

## Project Structure

```
Browser Annotation Tool/
├── backend/          # Flask API server
│   ├── main.py      # Main application file
│   ├── models.py    # Database models
│   ├── database.py  # Database configuration
│   └── requirements.txt
└── frontend/        # React application
    ├── src/
    ├── package.json
    └── vite.config.js
```

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd "Browser Annotation Tool"
```

### 2. Backend Setup

Navigate to the backend directory and set up a virtual environment:

```bash
cd backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Set Up PostgreSQL Database

Create a PostgreSQL database for the application:

```bash
# Log into PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE video_annotation;

# Create a user (optional)
CREATE USER your_username WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE video_annotation TO your_username;
```

### 4. Configure Environment Variables

Create a `.env` file in the `backend/` directory:

```bash
# Use the .env.example as a template
cp .env.example .env
```

Edit the `.env` file with your PostgreSQL credentials:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/video_annotation
PORT=5001
DEBUG=True
```

### 5. Initialize the Database

The database tables will be created automatically when you first run the application.

### 6. Frontend Setup

Open a new terminal window and navigate to the frontend directory:

```bash
cd frontend

# Install dependencies
npm install
```

## Running the Application

You need to run both the backend and frontend servers simultaneously.

### Terminal 1 - Backend Server

```bash
cd backend
source venv/bin/activate  # Activate virtual environment if not already active
python main.py
```

The backend server will start on `http://localhost:5001`

### Terminal 2 - Frontend Development Server

```bash
cd frontend
npm run dev
```

The frontend will start on `http://localhost:5173` (or another port if 5173 is busy).

## Accessing the Application

Once both servers are running, open your browser and navigate to:

```
http://localhost:5173
```

The frontend will automatically connect to the backend API.

## Available Scripts

### Backend

- `python main.py` - Start the Flask development server

### Frontend

- `npm run dev` - Start the Vite development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally

## Tech Stack

**Backend:**
- Flask 3.0.0
- Flask-SQLAlchemy 3.1.1 (ORM)
- PostgreSQL with psycopg2-binary 2.9.9 (Database)
- Flask-CORS 4.0.0 (Cross-Origin Resource Sharing)
- python-dotenv 1.0.0 (Environment variable management)
- yt-dlp 2024.12.13 (Automatic video duration fetching)

**Frontend:**
- React 18
- Vite (Build tool)
- JavaScript/JSX

## Features

- **Video Management**: Add single or multiple videos with metadata (title, description, topic, duration)
- **Automatic Duration Fetching**: For YouTube and other video URLs, duration is automatically fetched if not provided
- **Query Management**: Create and manage queries for each video with status tracking (pending/finished)
- **Timestamped Annotations**: Add annotations with start/end timestamps and detailed notes for each query
- **Export to JSON**: Export all video data including queries and annotations to JSON format
- **RESTful API**: Complete CRUD operations for videos, queries, and annotations

## API Endpoints

### Videos
- `POST /api/submit_video` - Submit a single video with optional queries and annotations
- `POST /api/submit_videos` - Submit multiple videos (array format)
- `GET /api/videos` - Get all videos
- `GET /api/videos/<id>` - Get a specific video by ID
- `DELETE /api/videos/<id>` - Delete a video

### Queries
- `POST /api/videos/<video_id>/queries` - Create a new query for a video
- `GET /api/videos/<video_id>/queries` - Get all queries for a video
- `PUT /api/queries/<query_id>` - Update a query
- `DELETE /api/queries/<query_id>` - Delete a query
- `PUT /api/queries/<query_id>/status` - Update query status (pending/finished)

### Annotations
- `POST /api/queries/<query_id>/annotations` - Create annotation for a query
- `GET /api/queries/<query_id>/annotations` - Get all annotations for a query
- `GET /api/annotations/<annotation_id>` - Get a specific annotation
- `PUT /api/annotations/<annotation_id>` - Update an annotation
- `DELETE /api/annotations/<annotation_id>` - Delete an annotation

### Health
- `GET /api/health` - Health check endpoint
- `GET /` - API information and available endpoints

## Troubleshooting

### Port Already in Use

If port 5001 or 5173 is already in use:

**Backend:** Edit the `PORT` variable in `backend/.env`

**Frontend:** Vite will automatically try the next available port

### PostgreSQL Connection Issues

If you encounter database connection errors:

1. Make sure PostgreSQL is running:
   ```bash
   # On macOS with Homebrew
   brew services start postgresql

   # On Linux
   sudo systemctl start postgresql
   ```

2. Verify your `DATABASE_URL` in `backend/.env` is correct

3. Check that the database exists:
   ```bash
   psql -U postgres -l
   ```

### Database Schema Issues

If you need to reset the database:

```bash
# Drop and recreate the database
psql -U postgres
DROP DATABASE video_annotation;
CREATE DATABASE video_annotation;
```

Then restart the backend server to recreate tables.

### CORS Errors

Make sure both servers are running and the backend has `flask-cors` installed.

## Development Notes

- The backend uses PostgreSQL (required - SQLite is no longer supported)
- Hot reload is enabled for both frontend and backend during development
- The database schema is automatically created on first run
- All timestamps are stored in HH:MM:SS format
- Query status can be either "pending" or "finished"
- The application supports importing/exporting data in JSON format

## Contributing

1. Create a new branch for your feature
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

[Add your license here]