# Browser Annotation Tool

A web application for annotating and analyzing browser interactions with video playback support. Built with Flask (backend) and React (frontend).

## Prerequisites

Before running this project, make sure you have the following installed:

- **Python 3.8+** - [Download](https://www.python.org/downloads/)
- **Node.js 16+** and npm - [Download](https://nodejs.org/)
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

### 3. Configure Environment Variables

Create a `.env` file in the `backend/` directory:

```bash
# Use the .env.example as a template
cp .env.example .env
```

Edit the `.env` file with your configuration (SQLite is configured by default for local development).

### 4. Initialize the Database

The database will be created automatically when you first run the application. It uses SQLite by default and stores the database in `backend/instance/video_annotation.db`.

### 5. Frontend Setup

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
- SQLAlchemy (ORM)
- SQLite/PostgreSQL (Database)
- Flask-CORS (Cross-Origin Resource Sharing)

**Frontend:**
- React 18
- Vite (Build tool)
- JavaScript/JSX

## Troubleshooting

### Port Already in Use

If port 5001 or 5173 is already in use:

**Backend:** Edit the `PORT` variable in `backend/.env`

**Frontend:** Vite will automatically try the next available port

### Database Issues

If you encounter database errors, try deleting the database and letting it recreate:

```bash
rm backend/instance/video_annotation.db
python backend/main.py
```

### CORS Errors

Make sure both servers are running and the backend has `flask-cors` installed.

## Development Notes

- The backend uses SQLite by default for easy local development
- Hot reload is enabled for both frontend and backend during development
- The database schema is automatically created on first run

## Contributing

1. Create a new branch for your feature
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

[Add your license here]