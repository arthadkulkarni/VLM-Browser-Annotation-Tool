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

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
    'DATABASE_URL',
    'postgresql://localhost/video_annotation'
)
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
    Endpoint to receive a video URL for processing.
    Expects JSON body with 'url' and 'title' fields.
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

        # Save video URL to database
        video = Video(url=video_url, title=video_title, status='pending')
        db.session.add(video)
        db.session.commit()

        return jsonify({
            'status': 'success',
            'message': 'Video URL saved to database',
            'video': video.to_dict()
        }), 201

    except Exception as e:
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
        video = Video.query.get(video_id)
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
        video = Video.query.get(video_id)
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
        video = Video.query.get(video_id)
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
        video = Video.query.get(video_id)
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


@app.route('/api/queries/<int:query_id>', methods=['DELETE'])
def delete_query(query_id):
    """Delete a specific query"""
    try:
        query = Query.query.get(query_id)
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


# Annotation endpoints
@app.route('/api/queries/<int:query_id>/annotations', methods=['POST'])
def create_annotation(query_id):
    """Create a new annotation for a specific query"""
    try:
        # Check if query exists
        query = Query.query.get(query_id)
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
        annotation = Annotation.query.get(annotation_id)
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
        annotation = Annotation.query.get(annotation_id)
        if not annotation:
            return jsonify({
                'error': 'Not found',
                'message': f'Annotation with ID {annotation_id} not found'
            }), 404

        data = request.get_json()

        # Update fields if provided
        if 'annotation_type' in data:
            if data['annotation_type'] not in ['grounding', 'counting', 'both']:
                return jsonify({
                    'error': 'Invalid annotation type',
                    'message': 'annotation_type must be "grounding", "counting", or "both"'
                }), 400
            annotation.annotation_type = data['annotation_type']

        if 'bounding_boxes' in data:
            annotation.bounding_boxes = data['bounding_boxes']
        if 'timestamp' in data:
            annotation.timestamp = data['timestamp']
        if 'frame_number' in data:
            annotation.frame_number = data['frame_number']
        if 'object_count' in data:
            annotation.object_count = data['object_count']
        if 'object_type' in data:
            annotation.object_type = data['object_type']
        if 'notes' in data:
            annotation.notes = data['notes']
        if 'confidence_score' in data:
            annotation.confidence_score = data['confidence_score']

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
        annotation = Annotation.query.get(annotation_id)
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
        return jsonify({
            'error': 'Server error',
            'message': str(e)
        }), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'True').lower() == 'true'

    print(f"Starting Flask server on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=debug)
