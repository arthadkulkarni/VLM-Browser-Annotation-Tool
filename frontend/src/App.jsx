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
  const [selectedFile, setSelectedFile] = useState(null)
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
  const [jsonPreview, setJsonPreview] = useState(null)
  const [editingQuery, setEditingQuery] = useState(null)
  const [editQueryText, setEditQueryText] = useState('')
  const [editingAnnotation, setEditingAnnotation] = useState(null)
  const [editAnnotationData, setEditAnnotationData] = useState({
    start_timestamp: '',
    end_timestamp: '',
    notes: ''
  })

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.type !== 'application/json') {
        setMessage('Error: Please upload a JSON file')
        return
      }

      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const jsonData = JSON.parse(event.target.result)
          setSelectedFile(file)
          setJsonPreview(jsonData)
          setMessage('')
        } catch (error) {
          setMessage('Error: Invalid JSON file')
          setSelectedFile(null)
          setJsonPreview(null)
        }
      }
      reader.readAsText(file)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    if (!jsonPreview) {
      setMessage('Error: Please select a JSON file')
      setLoading(false)
      return
    }

    try {
      console.log('Submitting JSON data:', jsonPreview)
      const response = await fetch('/api/submit_video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jsonPreview),
      })

      console.log('Response status:', response.status)

      const text = await response.text()
      console.log('Response text:', text)
      const data = text ? JSON.parse(text) : {}

      if (response.ok) {
        setMessage(`Success! Video submitted with ${data.queries_created || 0} queries and ${data.annotations_created || 0} annotations.`)
        setSelectedFile(null)
        setJsonPreview(null)
        // Reset file input
        document.getElementById('json-file-input').value = ''
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

  const handleEditQuery = (query) => {
    setEditingQuery(query.id)
    setEditQueryText(query.query_text)
  }

  const handleSaveQuery = async (queryId) => {
    try {
      const response = await fetch(`/api/queries/${queryId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query_text: editQueryText }),
      })

      if (response.ok && selectedVideo) {
        setEditingQuery(null)
        setEditQueryText('')
        fetchQueries(selectedVideo.id)
      }
    } catch (error) {
      console.error('Error updating query:', error)
    }
  }

  const handleCancelEditQuery = () => {
    setEditingQuery(null)
    setEditQueryText('')
  }

  const handleDeleteQuery = async (queryId) => {
    if (!window.confirm('Are you sure you want to delete this query? This will also delete all associated annotations.')) {
      return
    }

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

  const handleEditAnnotation = (annotation) => {
    setEditingAnnotation(annotation.id)
    setEditAnnotationData({
      start_timestamp: annotation.start_timestamp || '00:00:00',
      end_timestamp: annotation.end_timestamp || '00:00:00',
      notes: annotation.notes || ''
    })
  }

  const handleSaveAnnotation = async (annotationId) => {
    try {
      const response = await fetch(`/api/annotations/${annotationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editAnnotationData),
      })

      if (response.ok && selectedQuery) {
        setEditingAnnotation(null)
        setEditAnnotationData({
          start_timestamp: '00:00:00',
          end_timestamp: '00:00:00',
          notes: ''
        })
        fetchAnnotations(selectedQuery.id)
      }
    } catch (error) {
      console.error('Error updating annotation:', error)
    }
  }

  const handleCancelEditAnnotation = () => {
    setEditingAnnotation(null)
    setEditAnnotationData({
      start_timestamp: '00:00:00',
      end_timestamp: '00:00:00',
      notes: ''
    })
  }

  const handleDeleteAnnotation = async (annotationId) => {
    if (!window.confirm('Are you sure you want to delete this annotation?')) {
      return
    }

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
                  <label htmlFor="json-file-input">Upload JSON File:</label>
                  <input
                    type="file"
                    id="json-file-input"
                    accept=".json"
                    onChange={handleFileChange}
                    required
                  />
                  <small style={{ display: 'block', marginTop: '8px', color: '#666' }}>
                    Upload a JSON file with video metadata, queries, and annotations
                  </small>
                </div>

                {jsonPreview && (
                  <div className="form-group">
                    <label>JSON Preview:</label>
                    <div style={{
                      background: '#f5f5f5',
                      padding: '12px',
                      borderRadius: '4px',
                      maxHeight: '300px',
                      overflow: 'auto',
                      fontSize: '13px'
                    }}>
                      <pre style={{ margin: 0 }}>{JSON.stringify(jsonPreview, null, 2)}</pre>
                    </div>
                    <div style={{ marginTop: '8px', color: '#666', fontSize: '14px' }}>
                      <strong>Video:</strong> {jsonPreview.title || 'No title'}
                      {jsonPreview.queries && (
                        <>
                          <br />
                          <strong>Queries:</strong> {jsonPreview.queries.length}
                          <br />
                          <strong>Total Annotations:</strong> {
                            jsonPreview.queries.reduce((sum, q) =>
                              sum + (q.annotations ? q.annotations.length : 0), 0
                            )
                          }
                        </>
                      )}
                    </div>
                  </div>
                )}

                <button type="submit" disabled={loading || !jsonPreview}>
                  {loading ? 'Submitting...' : 'Submit Video Data'}
                </button>
              </form>

              {message && (
                <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
                  {message}
                </div>
              )}

              <div style={{ marginTop: '30px', padding: '20px', background: '#f9f9f9', borderRadius: '8px' }}>
                <h3 style={{ marginTop: 0 }}>Expected JSON Format:</h3>
                <pre style={{
                  background: '#fff',
                  padding: '15px',
                  borderRadius: '4px',
                  overflow: 'auto',
                  fontSize: '13px'
                }}>
{`{
  "url": "https://youtube.com/watch?v=...",
  "title": "Video Title",
  "description": "Video description (optional)",
  "topic": "Video topic/category (optional)",
  "queries": [
    {
      "query_text": "Your query text here",
      "annotations": [
        {
          "start_timestamp": "00:00:00",
          "end_timestamp": "00:00:05",
          "notes": "Description of what happens"
        }
      ]
    }
  ]
}`}
                </pre>
              </div>
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
                      {editingQuery === query.id ? (
                        <div className="query-edit-form">
                          <textarea
                            value={editQueryText}
                            onChange={(e) => setEditQueryText(e.target.value)}
                            rows="3"
                            style={{ width: '100%', padding: '8px', marginBottom: '8px' }}
                          />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="save-btn"
                              onClick={() => handleSaveQuery(query.id)}
                              style={{ background: '#4CAF50' }}
                            >
                              Save
                            </button>
                            <button
                              className="cancel-btn"
                              onClick={handleCancelEditQuery}
                              style={{ background: '#757575' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
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
                              className="edit-btn"
                              onClick={() => handleEditQuery(query)}
                              style={{ background: '#2196F3' }}
                            >
                              Edit
                            </button>
                            <button
                              className="delete-btn"
                              onClick={() => handleDeleteQuery(query.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
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
                      {editingAnnotation === annotation.id ? (
                        <div className="annotation-edit-form" style={{ width: '100%' }}>
                          <div className="form-group">
                            <label>Start Timestamp (HH:MM:SS):</label>
                            <input
                              type="text"
                              value={editAnnotationData.start_timestamp}
                              onChange={(e) => setEditAnnotationData({...editAnnotationData, start_timestamp: e.target.value})}
                              placeholder="00:00:00"
                              pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                              style={{ width: '100%', padding: '8px', marginBottom: '8px' }}
                            />
                          </div>
                          <div className="form-group">
                            <label>End Timestamp (HH:MM:SS):</label>
                            <input
                              type="text"
                              value={editAnnotationData.end_timestamp}
                              onChange={(e) => setEditAnnotationData({...editAnnotationData, end_timestamp: e.target.value})}
                              placeholder="00:00:00"
                              pattern="[0-9]{2}:[0-9]{2}:[0-9]{2}"
                              style={{ width: '100%', padding: '8px', marginBottom: '8px' }}
                            />
                          </div>
                          <div className="form-group">
                            <label>Description:</label>
                            <textarea
                              value={editAnnotationData.notes}
                              onChange={(e) => setEditAnnotationData({...editAnnotationData, notes: e.target.value})}
                              rows="3"
                              style={{ width: '100%', padding: '8px', marginBottom: '8px' }}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="save-btn"
                              onClick={() => handleSaveAnnotation(annotation.id)}
                              style={{ background: '#4CAF50' }}
                            >
                              Save
                            </button>
                            <button
                              className="cancel-btn"
                              onClick={handleCancelEditAnnotation}
                              style={{ background: '#757575' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
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
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="edit-btn"
                              onClick={() => handleEditAnnotation(annotation)}
                              style={{ background: '#2196F3' }}
                            >
                              Edit
                            </button>
                            <button
                              className="delete-btn"
                              onClick={() => handleDeleteAnnotation(annotation.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
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
