from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
from pathlib import Path
from dotenv import load_dotenv
from database import db, init_db
from models import Video, Query, Annotation
import yt_dlp
import re

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__, static_folder='static', static_url_path='/static')
CORS(app)

# Database configuration - PostgreSQL only
database_url = os.environ.get('DATABASE_URL')
if not database_url:
    raise ValueError("DATABASE_URL environment variable is not set. Please configure PostgreSQL connection in .env file")

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
init_db(app)

# Helper functions for video URL handling
def is_video_url(url):
    """
    Detect if a URL is a video link (YouTube, Vimeo, etc.)
    Returns True for any URL that starts with http/https
    """
    if not url:
        return False

    url_lower = url.lower()

    # Check if it's a web URL (not a local file path)
    if url_lower.startswith('http://') or url_lower.startswith('https://'):
        return True

    return False

def get_video_duration(url):
    """
    Fetch video duration using yt-dlp for YouTube and other video platforms.
    Returns duration in seconds, or None if unable to fetch.
    """
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            duration = info.get('duration')

            if duration:
                return int(duration)

    except Exception as e:
        print(f"Error fetching video duration for {url}: {str(e)}")

    return None

@app.route('/', methods=['GET'])
def home():
    """Home route with API information"""
    return jsonify({
        'message': 'Dataset Generation and Refinement Pipeline API',
        'version': '1.0',
        'endpoints': {
            'POST /api/submit_video': 'Submit a single video',
            'POST /api/submit_videos': 'Submit multiple videos (array)',
            'GET /api/videos': 'Get all videos',
            'GET /api/videos/<id>': 'Get a specific video by ID',
            'GET /api/health': 'Health check'
        },
        'database': 'Connected to PostgreSQL',
        'status': 'Running'
    }), 200

@app.route('/api/submit_video', methods=['POST'])
def submit_video_url():
    """
    Endpoint to receive video data from JSON file.
    Expects JSON body with video metadata, and optionally queries and annotations.

    Expected format:
    {
        "url": "video_url",
        "title": "video_title",
        "description": "video_description" (optional),
        "topic": "video_topic" (optional),
        "queries": [  (optional)
            {
                "query_text": "query text",
                "annotations": [  (optional)
                    {
                        "start_timestamp": "00:00:00",
                        "end_timestamp": "00:00:05",
                        "notes": "description"
                    }
                ]
            }
        ]
    }
    """
    try:
        data = request.get_json()

        if not data or 'url' not in data:
            return jsonify({
                'error': 'Missing video URL',
                'message': 'Please provide a "url" field in the request body'
            }), 400

        if not data or 'title' not in data:
            return jsonify({
                'error': 'Missing video title',
                'message': 'Please provide a "title" field in the request body'
            }), 400

        video_url = data['url']
        video_title = data['title']
        video_description = data.get('description', '')
        video_topic = data.get('topic', '')

        # Validate URL is not empty
        if not video_url.strip():
            return jsonify({
                'error': 'Empty URL',
                'message': 'Video URL cannot be empty'
            }), 400

        # Validate title is not empty
        if not video_title.strip():
            return jsonify({
                'error': 'Empty title',
                'message': 'Video title cannot be empty'
            }), 400

        # Check if video with this URL already exists
        existing_video = Video.query.filter_by(url=video_url).first()

        # Only validate/fetch duration if this is a new video
        if not existing_video:
            # Check if duration is provided (treat null as missing)
            video_duration = data.get('duration')
            if video_duration is None:
                video_duration = None

            # If duration is not provided (or null) and it's a video URL, try to fetch it automatically
            if not video_duration and is_video_url(video_url):
                print(f"Duration not provided for video URL {video_url}, attempting to fetch automatically...")
                video_duration = get_video_duration(video_url)

                if video_duration:
                    print(f"Successfully fetched duration: {video_duration} seconds")
                else:
                    return jsonify({
                        'error': 'Unable to fetch video duration',
                        'message': 'Could not automatically fetch video duration. Please provide a "duration" field (in seconds) in the request body or check if the URL is valid.'
                    }), 400
            elif not video_duration:
                # For non-video URLs (local files), duration is required
                return jsonify({
                    'error': 'Missing video duration',
                    'message': 'Please provide a "duration" field (in seconds) in the request body'
                }), 400

            # Validate duration is a positive number (if not already fetched as int)
            if not isinstance(video_duration, int):
                try:
                    video_duration = int(video_duration)
                except (ValueError, TypeError):
                    return jsonify({
                        'error': 'Invalid duration format',
                        'message': 'Video duration must be a number (in seconds)'
                    }), 400

            if video_duration <= 0:
                return jsonify({
                    'error': 'Invalid duration',
                    'message': 'Video duration must be a positive number (in seconds)'
                }), 400

        if existing_video:
            # Video exists, we'll add queries/annotations to it
            video = existing_video
            video_existed = True
        else:
            # Create new video record
            video = Video(
                url=video_url,
                title=video_title,
                description=video_description,
                topic=video_topic,
                duration=video_duration
            )
            db.session.add(video)
            db.session.flush()  # Get video ID before committing
            video_existed = False

        # Process queries if provided
        queries_data = data.get('queries', [])
        created_queries = []
        created_annotations = []

        for query_item in queries_data:
            if 'query_text' in query_item and query_item['query_text'].strip():
                query_text = query_item['query_text'].strip()

                # Check if this query already exists for this video
                existing_query = Query.query.filter_by(
                    video_id=video.id,
                    query_text=query_text
                ).first()

                if existing_query:
                    # Use existing query
                    query = existing_query
                else:
                    # Create new query
                    query = Query(
                        video_id=video.id,
                        query_text=query_text
                    )
                    db.session.add(query)
                    db.session.flush()  # Get query ID before processing annotations
                    created_queries.append(query.to_dict())

                # Process annotations (always add new annotations, even for existing queries)
                annotations_data = query_item.get('annotations', [])
                for annotation_item in annotations_data:
                    if 'notes' in annotation_item:
                        annotation = Annotation(
                            query_id=query.id,
                            start_timestamp=annotation_item.get('start_timestamp', '00:00:00'),
                            end_timestamp=annotation_item.get('end_timestamp', '00:00:00'),
                            notes=annotation_item['notes']
                        )
                        db.session.add(annotation)
                        created_annotations.append(annotation_item)

        db.session.commit()

        if video_existed:
            message = f'Annotations and queries added to existing video: {video.title}'
        else:
            message = 'Video data saved to database'

        return jsonify({
            'status': 'success',
            'message': message,
            'video': video.to_dict(),
            'video_existed': video_existed,
            'queries_created': len(created_queries),
            'annotations_created': len(created_annotations)
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


@app.route('/api/submit_videos', methods=['POST'])
def submit_multiple_videos():
    """
    Endpoint to receive multiple videos from JSON file.
    Expects JSON body as an array of video objects.

    Expected format:
    [
        {
            "url": "video_url",
            "title": "video_title",
            "description": "video_description" (optional),
            "topic": "video_topic" (optional),
            "duration": duration_in_seconds,
            "queries": [  (optional)
                {
                    "query_text": "query text",
                    "annotations": [  (optional)
                        {
                            "start_timestamp": "00:00:00",
                            "end_timestamp": "00:00:05",
                            "notes": "description"
                        }
                    ]
                }
            ]
        }
    ]
    """
    try:
        data = request.get_json()

        # Check if data is a list
        if not isinstance(data, list):
            return jsonify({
                'error': 'Invalid format',
                'message': 'Expected an array of video objects'
            }), 400

        if len(data) == 0:
            return jsonify({
                'error': 'Empty array',
                'message': 'Please provide at least one video'
            }), 400

        results = []
        total_queries = 0
        total_annotations = 0

        for idx, video_data in enumerate(data):
            # Validate required fields for each video
            if not video_data or 'url' not in video_data:
                return jsonify({
                    'error': f'Missing video URL at index {idx}',
                    'message': f'Please provide a "url" field for video at index {idx}'
                }), 400

            if not video_data or 'title' not in video_data:
                return jsonify({
                    'error': f'Missing video title at index {idx}',
                    'message': f'Please provide a "title" field for video at index {idx}'
                }), 400

            video_url = video_data['url']
            video_title = video_data['title']
            video_description = video_data.get('description', '')
            video_topic = video_data.get('topic', '')

            # Validate URL is not empty
            if not video_url.strip():
                return jsonify({
                    'error': f'Empty URL at index {idx}',
                    'message': f'Video URL cannot be empty for video at index {idx}'
                }), 400

            # Validate title is not empty
            if not video_title.strip():
                return jsonify({
                    'error': f'Empty title at index {idx}',
                    'message': f'Video title cannot be empty for video at index {idx}'
                }), 400

            # Check if video with this URL already exists
            existing_video = Video.query.filter_by(url=video_url).first()

            # Only validate/fetch duration if this is a new video
            if not existing_video:
                # Check if duration is provided (treat null as missing)
                video_duration = video_data.get('duration')
                if video_duration is None:
                    video_duration = None

                # If duration is not provided (or null) and it's a video URL, try to fetch it automatically
                if not video_duration and is_video_url(video_url):
                    print(f"Duration not provided for video URL {video_url} at index {idx}, attempting to fetch automatically...")
                    video_duration = get_video_duration(video_url)

                    if video_duration:
                        print(f"Successfully fetched duration: {video_duration} seconds for video at index {idx}")
                    else:
                        return jsonify({
                            'error': f'Unable to fetch video duration at index {idx}',
                            'message': f'Could not automatically fetch video duration for video at index {idx}. Please provide a "duration" field (in seconds) or check if the URL is valid.'
                        }), 400
                elif not video_duration:
                    # For non-video URLs (local files), duration is required
                    return jsonify({
                        'error': f'Missing video duration at index {idx}',
                        'message': f'Please provide a "duration" field (in seconds) for video at index {idx}'
                    }), 400

                # Validate duration is a positive number (if not already fetched as int)
                if not isinstance(video_duration, int):
                    try:
                        video_duration = int(video_duration)
                    except (ValueError, TypeError):
                        return jsonify({
                            'error': f'Invalid duration format at index {idx}',
                            'message': f'Video duration must be a number (in seconds) for video at index {idx}'
                        }), 400

                if video_duration <= 0:
                    return jsonify({
                        'error': f'Invalid duration at index {idx}',
                        'message': f'Video duration must be a positive number (in seconds) for video at index {idx}'
                    }), 400

            if existing_video:
                # Video exists, we'll add queries/annotations to it
                video = existing_video
                video_existed = True
            else:
                # Create new video record
                video = Video(
                    url=video_url,
                    title=video_title,
                    description=video_description,
                    topic=video_topic,
                    duration=video_duration
                )
                db.session.add(video)
                db.session.flush()  # Get video ID before committing
                video_existed = False

            # Process queries if provided
            queries_data = video_data.get('queries', [])
            created_queries = []
            created_annotations = []

            for query_item in queries_data:
                if 'query_text' in query_item and query_item['query_text'].strip():
                    query_text = query_item['query_text'].strip()

                    # Check if this query already exists for this video
                    existing_query = Query.query.filter_by(
                        video_id=video.id,
                        query_text=query_text
                    ).first()

                    if existing_query:
                        # Use existing query
                        query = existing_query
                    else:
                        # Create new query
                        query = Query(
                            video_id=video.id,
                            query_text=query_text
                        )
                        db.session.add(query)
                        db.session.flush()  # Get query ID before processing annotations
                        created_queries.append(query.to_dict())

                    # Process annotations (always add new annotations, even for existing queries)
                    annotations_data = query_item.get('annotations', [])
                    for annotation_item in annotations_data:
                        if 'notes' in annotation_item:
                            annotation = Annotation(
                                query_id=query.id,
                                start_timestamp=annotation_item.get('start_timestamp', '00:00:00'),
                                end_timestamp=annotation_item.get('end_timestamp', '00:00:00'),
                                notes=annotation_item['notes']
                            )
                            db.session.add(annotation)
                            created_annotations.append(annotation_item)

            total_queries += len(created_queries)
            total_annotations += len(created_annotations)

            results.append({
                'video': video.to_dict(),
                'video_existed': video_existed,
                'queries_created': len(created_queries),
                'annotations_created': len(created_annotations)
            })

        db.session.commit()

        # Count how many videos were new vs existing
        new_videos = sum(1 for r in results if not r['video_existed'])
        existing_videos = sum(1 for r in results if r['video_existed'])

        message_parts = []
        if new_videos > 0:
            message_parts.append(f'{new_videos} new video(s) created')
        if existing_videos > 0:
            message_parts.append(f'{existing_videos} existing video(s) updated with new annotations/queries')

        message = 'Successfully processed: ' + ', '.join(message_parts)

        return jsonify({
            'status': 'success',
            'message': message,
            'videos_processed': len(results),
            'new_videos': new_videos,
            'existing_videos': existing_videos,
            'total_queries_created': total_queries,
            'total_annotations_created': total_annotations,
            'results': results
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


@app.route('/api/videos', methods=['GET'])
def get_all_videos():
    """Get all videos from the database"""
    try:
        videos = Video.query.order_by(Video.created_at.desc()).all()
        return jsonify({
            'status': 'success',
            'count': len(videos),
            'videos': [video.to_dict() for video in videos]
        }), 200
    except Exception as e:
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


@app.route('/api/videos/<int:video_id>', methods=['GET'])
def get_video(video_id):
    """Get a specific video by ID"""
    try:
        video = db.session.get(Video, video_id)
        if not video:
            return jsonify({
                'error': 'Not found',
                'message': f'Video with ID {video_id} not found'
            }), 404

        return jsonify({
            'status': 'success',
            'video': video.to_dict()
        }), 200
    except Exception as e:
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


@app.route('/api/videos/<int:video_id>', methods=['DELETE'])
def delete_video(video_id):
    """Delete a specific video"""
    try:
        video = db.session.get(Video, video_id)
        if not video:
            return jsonify({
                'error': 'Not found',
                'message': f'Video with ID {video_id} not found'
            }), 404

        db.session.delete(video)
        db.session.commit()

        return jsonify({
            'status': 'success',
            'message': 'Video deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'Backend is running'
    }), 200


@app.route('/api/serve_video/<int:video_id>', methods=['GET'])
def serve_video(video_id):
    """
    Serve video files. Handles local file paths by serving them through the backend.
    For remote URLs (YouTube, Vimeo), returns the original URL.
    """
    try:
        video = db.session.get(Video, video_id)
        if not video:
            return jsonify({
                'error': 'Not found',
                'message': f'Video with ID {video_id} not found'
            }), 404

        video_url = video.url

        # Check if it's a local file (ends with video extension and doesn't start with http)
        video_extensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv']
        is_local_file = any(video_url.lower().endswith(ext) for ext in video_extensions) and not video_url.startswith('http')

        if is_local_file:
            # Try multiple possible locations for the video file
            possible_paths = [
                # Exact path as provided (could be absolute or relative)
                video_url,
                # Expand ~ to home directory
                os.path.expanduser(video_url),
                # In static/videos directory
                os.path.join(os.path.dirname(__file__), 'static', 'videos', os.path.basename(video_url)),
                # In project root/videos directory
                os.path.join(os.path.dirname(os.path.dirname(__file__)), 'videos', os.path.basename(video_url)),
                # In Downloads folder
                os.path.join(os.path.expanduser('~'), 'Downloads', os.path.basename(video_url)),
                # In current working directory
                os.path.join(os.getcwd(), video_url),
                os.path.join(os.getcwd(), os.path.basename(video_url)),
            ]

            video_path = None
            for path in possible_paths:
                abs_path = os.path.abspath(path)
                if os.path.exists(abs_path) and os.path.isfile(abs_path):
                    video_path = abs_path
                    break

            if not video_path:
                return jsonify({
                    'error': 'Video file not found',
                    'message': f'Video file "{video_url}" not found. Please provide the full path to the video file in the JSON (e.g., "/Users/username/Downloads/video.mp4")',
                    'searched_paths': [os.path.abspath(p) for p in possible_paths]
                }), 404

            # Detect MIME type from file extension
            ext = os.path.splitext(video_path)[1].lower()
            mime_types = {
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.ogg': 'video/ogg',
                '.mov': 'video/quicktime',
                '.avi': 'video/x-msvideo',
                '.mkv': 'video/x-matroska'
            }
            mimetype = mime_types.get(ext, 'video/mp4')

            return send_file(video_path, mimetype=mimetype)
        else:
            # For remote URLs (YouTube, Vimeo, etc.), return the URL as JSON
            return jsonify({
                'type': 'remote',
                'url': video_url
            }), 200

    except Exception as e:
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


@app.route('/api/videos/<int:video_id>/queries', methods=['POST'])
def create_query(video_id):
    """Create a new query for a specific video"""
    try:
        # Check if video exists
        video = db.session.get(Video, video_id)
        if not video:
            return jsonify({
                'error': 'Not found',
                'message': f'Video with ID {video_id} not found'
            }), 404

        data = request.get_json()

        if not data or 'query_text' not in data:
            return jsonify({
                'error': 'Missing query text',
                'message': 'Please provide a "query_text" field in the request body'
            }), 400

        query_text = data['query_text']

        if not query_text.strip():
            return jsonify({
                'error': 'Empty query',
                'message': 'Query text cannot be empty'
            }), 400

        # Create new query
        query = Query(video_id=video_id, query_text=query_text)
        db.session.add(query)
        db.session.commit()

        return jsonify({
            'status': 'success',
            'message': 'Query created successfully',
            'query': query.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


@app.route('/api/videos/<int:video_id>/queries', methods=['GET'])
def get_queries(video_id):
    """Get all queries for a specific video"""
    try:
        # Check if video exists
        video = db.session.get(Video, video_id)
        if not video:
            return jsonify({
                'error': 'Not found',
                'message': f'Video with ID {video_id} not found'
            }), 404

        queries = Query.query.filter_by(video_id=video_id).order_by(Query.created_at.desc()).all()

        return jsonify({
            'status': 'success',
            'video_id': video_id,
            'count': len(queries),
            'queries': [query.to_dict() for query in queries]
        }), 200

    except Exception as e:
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


@app.route('/api/queries/<int:query_id>', methods=['PUT'])
def update_query(query_id):
    """Update a specific query"""
    try:
        query = db.session.get(Query, query_id)
        if not query:
            return jsonify({
                'error': 'Not found',
                'message': f'Query with ID {query_id} not found'
            }), 404

        data = request.get_json()

        if 'query_text' in data:
            if not data['query_text'].strip():
                return jsonify({
                    'error': 'Empty query',
                    'message': 'Query text cannot be empty'
                }), 400
            query.query_text = data['query_text']

        db.session.commit()

        return jsonify({
            'status': 'success',
            'message': 'Query updated successfully',
            'query': query.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


@app.route('/api/queries/<int:query_id>', methods=['DELETE'])
def delete_query(query_id):
    """Delete a specific query"""
    try:
        query = db.session.get(Query, query_id)
        if not query:
            return jsonify({
                'error': 'Not found',
                'message': f'Query with ID {query_id} not found'
            }), 404

        db.session.delete(query)
        db.session.commit()

        return jsonify({
            'status': 'success',
            'message': 'Query deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


@app.route('/api/queries/<int:query_id>/status', methods=['PUT'])
def update_query_status(query_id):
    """Update the status of a specific query (pending or finished)"""
    try:
        query = db.session.get(Query, query_id)
        if not query:
            return jsonify({
                'error': 'Not found',
                'message': f'Query with ID {query_id} not found'
            }), 404

        data = request.get_json()

        if 'status' not in data:
            return jsonify({
                'error': 'Missing status',
                'message': 'Please provide a "status" field in the request body'
            }), 400

        status = data['status']

        # Validate status value
        if status not in ['pending', 'finished']:
            return jsonify({
                'error': 'Invalid status',
                'message': 'Status must be either "pending" or "finished"'
            }), 400

        query.status = status
        db.session.commit()

        return jsonify({
            'status': 'success',
            'message': f'Query status updated to {status}',
            'query': query.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


# Annotation endpoints
@app.route('/api/queries/<int:query_id>/annotations', methods=['POST'])
def create_annotation(query_id):
    """Create a new annotation for a specific query"""
    try:
        # Check if query exists
        query = db.session.get(Query, query_id)
        if not query:
            return jsonify({
                'error': 'Not found',
                'message': f'Query with ID {query_id} not found'
            }), 404

        data = request.get_json()

        if not data or 'notes' not in data:
            return jsonify({
                'error': 'Missing description',
                'message': 'Please provide a "notes" field with the description'
            }), 400

        # Create new annotation
        annotation = Annotation(
            query_id=query_id,
            start_timestamp=data.get('start_timestamp', '00:00:00'),
            end_timestamp=data.get('end_timestamp', '00:00:00'),
            notes=data.get('notes')
        )
        db.session.add(annotation)
        db.session.commit()

        return jsonify({
            'status': 'success',
            'message': 'Annotation created successfully',
            'annotation': annotation.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        print(f"Error creating annotation: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


@app.route('/api/queries/<int:query_id>/annotations', methods=['GET'])
def get_annotations(query_id):
    """Get all annotations for a specific query"""
    try:
        # Check if query exists
        query_obj = db.session.get(Query, query_id)
        if not query_obj:
            return jsonify({
                'error': 'Not found',
                'message': f'Query with ID {query_id} not found'
            }), 404

        annotations = db.session.query(Annotation).filter_by(query_id=query_id).order_by(Annotation.created_at.desc()).all()

        return jsonify({
            'status': 'success',
            'query_id': query_id,
            'count': len(annotations),
            'annotations': [annotation.to_dict() for annotation in annotations]
        }), 200

    except Exception as e:
        print(f"Error fetching annotations: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


@app.route('/api/annotations/<int:annotation_id>', methods=['GET'])
def get_annotation(annotation_id):
    """Get a specific annotation by ID"""
    try:
        annotation = db.session.get(Annotation, annotation_id)
        if not annotation:
            return jsonify({
                'error': 'Not found',
                'message': f'Annotation with ID {annotation_id} not found'
            }), 404

        return jsonify({
            'status': 'success',
            'annotation': annotation.to_dict()
        }), 200

    except Exception as e:
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


@app.route('/api/annotations/<int:annotation_id>', methods=['PUT'])
def update_annotation(annotation_id):
    """Update an existing annotation"""
    try:
        annotation = db.session.get(Annotation, annotation_id)
        if not annotation:
            return jsonify({
                'error': 'Not found',
                'message': f'Annotation with ID {annotation_id} not found'
            }), 404

        data = request.get_json()

        # Update fields if provided
        if 'start_timestamp' in data:
            annotation.start_timestamp = data['start_timestamp']
        if 'end_timestamp' in data:
            annotation.end_timestamp = data['end_timestamp']
        if 'notes' in data:
            annotation.notes = data['notes']

        db.session.commit()

        return jsonify({
            'status': 'success',
            'message': 'Annotation updated successfully',
            'annotation': annotation.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


@app.route('/api/annotations/<int:annotation_id>', methods=['DELETE'])
def delete_annotation(annotation_id):
    """Delete a specific annotation"""
    try:
        annotation = db.session.get(Annotation, annotation_id)
        if not annotation:
            return jsonify({
                'error': 'Not found',
                'message': f'Annotation with ID {annotation_id} not found'
            }), 404

        db.session.delete(annotation)
        db.session.commit()

        return jsonify({
            'status': 'success',
            'message': 'Annotation deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error deleting annotation: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'True').lower() == 'true'

    print(f"Starting Flask server on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=debug)
