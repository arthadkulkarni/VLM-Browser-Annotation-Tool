import { useState } from 'react'
import './App.css'

// Helper function to determine video type and get embed URL
const getVideoEmbedInfo = (url) => {
  // YouTube patterns
  const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/
  const youtubeMatch = url.match(youtubeRegex)
  if (youtubeMatch) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}`,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeMatch[1]}/mqdefault.jpg`
    }
  }

  // Vimeo pattern
  const vimeoRegex = /(?:vimeo\.com\/)(\d+)/
  const vimeoMatch = url.match(vimeoRegex)
  if (vimeoMatch) {
    return {
      type: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
      thumbnailUrl: null
    }
  }

  // Direct video file or other
  return {
    type: 'direct',
    embedUrl: url,
    thumbnailUrl: null
  }
}

function App() {
  const [activeTab, setActiveTab] = useState('submit')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [videos, setVideos] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [queries, setQueries] = useState([])
  const [newQuery, setNewQuery] = useState('')
  const [selectedQuery, setSelectedQuery] = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [annotationData, setAnnotationData] = useState({
    start_timestamp: '00:00:00',
    end_timestamp: '00:00:00',
    notes: ''
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      console.log('Submitting URL:', url, 'Title:', title)
      const response = await fetch('/api/submit_video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, title }),
      })

      console.log('Response status:', response.status)

      // Check if response has content
      const text = await response.text()
      console.log('Response text:', text)
      const data = text ? JSON.parse(text) : {}

      if (response.ok) {
        setMessage(`Success! Video submitted.`)
        setUrl('')
        setTitle('')
      } else {
        setMessage(`Error: ${data.message || 'Failed to submit video'}`)
      }
    } catch (error) {
      console.error('Full error:', error)
      setMessage(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const fetchVideos = async () => {
    try {
      const response = await fetch('/api/videos')
      const text = await response.text()
      const data = text ? JSON.parse(text) : {}
      if (response.ok) {
        setVideos(data.videos || [])
      }
    } catch (error) {
      console.error('Error fetching videos:', error)
    }
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'history') {
      fetchVideos()
      setSelectedVideo(null)
    }
  }

  const fetchQueries = async (videoId) => {
    try {
      const response = await fetch(`/api/videos/${videoId}/queries`)
      const data = await response.json()
      if (response.ok) {
        setQueries(data.queries || [])
      }
    } catch (error) {
      console.error('Error fetching queries:', error)
    }
  }

  const handleAddQuery = async (e) => {
    e.preventDefault()
    if (!newQuery.trim() || !selectedVideo) return

    try {
      const response = await fetch(`/api/videos/${selectedVideo.id}/queries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query_text: newQuery }),
      })

      if (response.ok) {
        setNewQuery('')
        fetchQueries(selectedVideo.id)
      }
    } catch (error) {
      console.error('Error adding query:', error)
    }
  }

  const handleDeleteQuery = async (queryId) => {
    try {
      const response = await fetch(`/api/queries/${queryId}`, {
        method: 'DELETE',
      })

      if (response.ok && selectedVideo) {
        fetchQueries(selectedVideo.id)
      }
    } catch (error) {
      console.error('Error deleting query:', error)
    }
  }

  const handleViewQueries = (video, e) => {
    e.stopPropagation()
    setSelectedVideo(video)
    fetchQueries(video.id)
    setActiveTab('queries')
  }

  const fetchAnnotations = async (queryId) => {
    try {
      const response = await fetch(`/api/queries/${queryId}/annotations`)
      const data = await response.json()
      if (response.ok) {
        setAnnotations(data.annotations || [])
      }
    } catch (error) {
      console.error('Error fetching annotations:', error)
    }
  }

  const handleViewAnnotations = (query, e) => {
    e.stopPropagation()
    setSelectedQuery(query)
    fetchAnnotations(query.id)
    setActiveTab('annotations')
  }

  const handleAddAnnotation = async (e) => {
    e.preventDefault()
    if (!selectedQuery) return

    try {
      const payload = {
        start_timestamp: annotationData.start_timestamp,
        end_timestamp: annotationData.end_timestamp,
        notes: annotationData.notes
      }

      const response = await fetch(`/api/queries/${selectedQuery.id}/annotations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        setAnnotationData({
          start_timestamp: '00:00:00',
          end_timestamp: '00:00:00',
          notes: ''
        })
        fetchAnnotations(selectedQuery.id)
      }
    } catch (error) {
      console.error('Error adding annotation:', error)
    }
  }

  const handleDeleteAnnotation = async (annotationId) => {
    try {
      const response = await fetch(`/api/annotations/${annotationId}`, {
        method: 'DELETE',
      })

      if (response.ok && selectedQuery) {
        fetchAnnotations(selectedQuery.id)
      }
    } catch (error) {
      console.error('Error deleting annotation:', error)
    }
  }

  const handleDeleteVideo = async (videoId, e) => {
    e.stopPropagation()
    if (!window.confirm('Are you sure you want to delete this video? This will also delete all associated queries and annotations.')) {
      return
    }

    try {
      const response = await fetch(`/api/videos/${videoId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchVideos()
      }
    } catch (error) {
      console.error('Error deleting video:', error)
    }
  }

  return (
    <div className="app">
      <div className="container">
        <h1>Dataset Generation and Refinement Pipeline</h1>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'submit' ? 'active' : ''}`}
            onClick={() => handleTabChange('submit')}
          >
            Submit Video
          </button>
          <button
            className={`tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => handleTabChange('history')}
          >
            Submission History
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'submit' && (
            <div className="submit-tab">
              <form onSubmit={handleSubmit} className="video-form">
                <div className="form-group">
                  <label htmlFor="title">Video Title:</label>
                  <input
                    type="text"
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter video title"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="url">Video URL:</label>
                  <input
                    type="text"
                    id="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="YouTube, Vimeo, or direct video URL"
                    required
                  />
                </div>

                <button type="submit" disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit Video'}
                </button>
              </form>

              {message && (
                <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
                  {message}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="history-tab">
              <div className="videos-header">
                <h2>Submitted Videos</h2>
                <button onClick={fetchVideos} className="refresh-btn">
                  Refresh
                </button>
              </div>

              {videos.length === 0 ? (
                <p className="no-videos">No videos submitted yet</p>
              ) : (
                <div className="videos-list">
                  {videos.map((video) => {
                    const embedInfo = getVideoEmbedInfo(video.url)
                    return (
                      <div
                        key={video.id}
                        className="video-card"
                        onClick={() => window.open(video.url, '_blank')}
                      >
                        <div className="video-thumbnail">
                          {embedInfo.type === 'youtube' && embedInfo.thumbnailUrl ? (
                            <img src={embedInfo.thumbnailUrl} alt={video.title} />
                          ) : embedInfo.type === 'vimeo' ? (
                            <div className="video-placeholder">Vimeo Video</div>
                          ) : (
                            <video
                              src={video.url}
                              preload="metadata"
                              muted
                            />
                          )}
                        </div>
                        <div className="video-details">
                          <div className="video-info">
                            <span className={`video-status status-${video.status}`}>
                              {video.status}
                            </span>
                          </div>
                          <div className="video-title">{video.title || 'Untitled Video'}</div>
                          <div className="video-date">
                            {new Date(video.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="video-actions">
                          <button
                            className="queries-btn"
                            onClick={(e) => handleViewQueries(video, e)}
                          >
                            Queries
                          </button>
                          <button
                            className="delete-btn"
                            onClick={(e) => handleDeleteVideo(video.id, e)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'queries' && selectedVideo && (
            <div className="queries-tab">
              <div className="queries-header">
                <button
                  className="back-btn"
                  onClick={() => handleTabChange('history')}
                >
                  ← Back to Videos
                </button>
                <h2>Queries for: {selectedVideo.title}</h2>
              </div>

              <form onSubmit={handleAddQuery} className="query-form">
                <div className="form-group">
                  <label htmlFor="query">Add New Query:</label>
                  <textarea
                    id="query"
                    value={newQuery}
                    onChange={(e) => setNewQuery(e.target.value)}
                    placeholder="Enter your query here..."
                    rows="3"
                    required
                  />
                </div>
                <button type="submit">Add Query</button>
              </form>

              <div className="queries-list">
                <h3>All Queries ({queries.length})</h3>
                {queries.length === 0 ? (
                  <p className="no-queries">No queries yet. Add one above!</p>
                ) : (
                  queries.map((query) => (
                    <div key={query.id} className="query-item">
                      <div className="query-content">
                        <p>{query.query_text}</p>
                        <span className="query-date">
                          {new Date(query.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="query-actions">
                        <button
                          className="annotations-btn"
                          onClick={(e) => handleViewAnnotations(query, e)}
                        >
                          Annotations
                        </button>
                        <button
                          className="delete-btn"
                          onClick={() => handleDeleteQuery(query.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'annotations' && selectedQuery && (
            <div className="annotations-tab">
              <div className="annotations-header">
                <button
                  className="back-btn"
                  onClick={() => setActiveTab('queries')}
                >
                  ← Back to Queries
                </button>
                <h2>Annotations for: {selectedQuery.query_text}</h2>
              </div>

              <form onSubmit={handleAddAnnotation} className="annotation-form">
                <h3>Add New Annotation</h3>

                <div className="form-group">
                  <label htmlFor="start-timestamp">Start Timestamp (HH:MM:SS):</label>
                  <input
                    type="text"
                    id="start-timestamp"
                    value={annotationData.start_timestamp}
                    onChange={(e) => setAnnotationData({...annotationData, start_timestamp: e.target.value})}
                    placeholder="00:00:00"
                    pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                    title="Format: HH:MM:SS (e.g., 00:01:30)"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="end-timestamp">End Timestamp (HH:MM:SS):</label>
                  <input
                    type="text"
                    id="end-timestamp"
                    value={annotationData.end_timestamp}
                    onChange={(e) => setAnnotationData({...annotationData, end_timestamp: e.target.value})}
                    placeholder="00:00:00"
                    pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                    title="Format: HH:MM:SS (e.g., 00:01:45)"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="notes">Description:</label>
                  <textarea
                    id="notes"
                    value={annotationData.notes}
                    onChange={(e) => setAnnotationData({...annotationData, notes: e.target.value})}
                    placeholder="Describe what happens in this time range..."
                    rows="4"
                    required
                  />
                </div>

                <button type="submit">Add Annotation</button>
              </form>

              <div className="annotations-list">
                <h3>All Annotations ({annotations.length})</h3>
                {annotations.length === 0 ? (
                  <p className="no-annotations">No annotations yet. Add one above!</p>
                ) : (
                  annotations.map((annotation) => (
                    <div key={annotation.id} className="annotation-item">
                      <div className="annotation-content">
                        {(annotation.start_timestamp || annotation.end_timestamp) && (
                          <p>
                            <strong>Time Range:</strong> {annotation.start_timestamp || '00:00:00'} - {annotation.end_timestamp || '00:00:00'}
                          </p>
                        )}
                        {annotation.notes && (
                          <p><strong>Description:</strong> {annotation.notes}</p>
                        )}
                        <span className="annotation-date">
                          {new Date(annotation.created_at).toLocaleString()}
                        </span>
                      </div>
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteAnnotation(annotation.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
