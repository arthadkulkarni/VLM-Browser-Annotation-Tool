from database import db
from datetime import datetime

class Video(db.Model):
    """Model for storing video URLs and metadata"""
    __tablename__ = 'videos'

    id = db.Column(db.Integer, primary_key=True)
    url = db.Column(db.String(2048), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Metadata fields
    title = db.Column(db.String(500), nullable=False)
    description = db.Column(db.Text)  # Video description
    topic = db.Column(db.String(200))  # Video topic/category
    duration = db.Column(db.Integer)  # Duration in seconds
    notes = db.Column(db.Text)
    annotator = db.Column(db.String(200), nullable=False)  # Name of the person assigned to annotate
    status = db.Column(db.String(50), default='pending')  # pending or finished (based on queries)

    # Relationship to queries
    queries = db.relationship('Query', backref='video', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'url': self.url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'title': self.title,
            'description': self.description,
            'topic': self.topic,
            'duration': self.duration,
            'notes': self.notes,
            'annotator': self.annotator,
            'status': self.status
        }

    def __repr__(self):
        return f'<Video {self.id}: {self.url[:50]}...>'


class Query(db.Model):
    """Model for storing queries related to videos"""
    __tablename__ = 'queries'

    id = db.Column(db.Integer, primary_key=True)
    video_id = db.Column(db.Integer, db.ForeignKey('videos.id'), nullable=False)
    query_text = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(50), default='pending')  # pending or finished
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship to annotations
    annotations = db.relationship('Annotation', backref='query', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'video_id': self.video_id,
            'query_text': self.query_text,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def __repr__(self):
        return f'<Query {self.id} for Video {self.video_id}>'


class Annotation(db.Model):
    """Model for storing annotations with time ranges and descriptions"""
    __tablename__ = 'annotations'

    id = db.Column(db.Integer, primary_key=True)
    query_id = db.Column(db.Integer, db.ForeignKey('queries.id'), nullable=False)

    # Timestamp fields (stored as HH:MM:SS strings)
    start_timestamp = db.Column(db.String(8))  # Start time in HH:MM:SS format
    end_timestamp = db.Column(db.String(8))    # End time in HH:MM:SS format

    # Description
    notes = db.Column(db.Text, nullable=True)  # Description of what happens (optional)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'query_id': self.query_id,
            'start_timestamp': self.start_timestamp,
            'end_timestamp': self.end_timestamp,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def __repr__(self):
        return f'<Annotation {self.id} for Query {self.query_id}>'
