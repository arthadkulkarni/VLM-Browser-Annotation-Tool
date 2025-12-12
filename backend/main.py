from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
from database import db, init_db
from models import Video, Query, Annotation

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

# Database configuration - PostgreSQL only
database_url = os.environ.get('DATABASE_URL')
if not database_url:
    raise ValueError("DATABASE_URL environment variable is not set. Please configure PostgreSQL connection in .env file")

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
init_db(app)

@app.route('/', methods=['GET'])
def home():
    """Home route with API information"""
    return jsonify({
        'message': 'Dataset Generation and Refinement Pipeline API',
        'version': '1.0',
        'endpoints': {
            'POST /api/submit_video': 'Submit a new video URL',
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

        if not data or 'duration' not in data:
            return jsonify({
                'error': 'Missing video duration',
                'message': 'Please provide a "duration" field (in seconds) in the request body'
            }), 400

        video_url = data['url']
        video_title = data['title']
        video_duration = data['duration']
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

        # Validate duration is a positive number
        try:
            video_duration = int(video_duration)
            if video_duration <= 0:
                return jsonify({
                    'error': 'Invalid duration',
                    'message': 'Video duration must be a positive number (in seconds)'
                }), 400
        except (ValueError, TypeError):
            return jsonify({
                'error': 'Invalid duration format',
                'message': 'Video duration must be a number (in seconds)'
            }), 400

        # Create video record
        video = Video(
            url=video_url,
            title=video_title,
            description=video_description,
            topic=video_topic,
            duration=video_duration
        )
        db.session.add(video)
        db.session.flush()  # Get video ID before committing

        # Process queries if provided
        queries_data = data.get('queries', [])
        created_queries = []
        created_annotations = []

        for query_item in queries_data:
            if 'query_text' in query_item and query_item['query_text'].strip():
                # Create query
                query = Query(
                    video_id=video.id,
                    query_text=query_item['query_text']
                )
                db.session.add(query)
                db.session.flush()  # Get query ID before processing annotations
                created_queries.append(query.to_dict())

                # Process annotations if provided
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

        return jsonify({
            'status': 'success',
            'message': 'Video data saved to database',
            'video': video.to_dict(),
            'queries_created': len(created_queries),
            'annotations_created': len(created_annotations)
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
