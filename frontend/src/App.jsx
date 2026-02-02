import { useState, useRef, useEffect } from 'react'
import './App.css'

// Cloudflare R2 bucket URL for YouTube video backups
const R2_BUCKET_URL = 'https://pub-65bff4cb79da43bd8324fa834e11bf15.r2.dev'

// Helper function to convert timestamp (HH:MM:SS) to seconds
const timestampToSeconds = (timestamp) => {
  if (!timestamp) return 0
  const parts = timestamp.split(':')
  if (parts.length !== 3) return 0
  const hours = parseInt(parts[0], 10) || 0
  const minutes = parseInt(parts[1], 10) || 0
  const seconds = parseInt(parts[2], 10) || 0
  return hours * 3600 + minutes * 60 + seconds
}

// Helper function to determine video type and get embed URL
const getVideoEmbedInfo = (url, videoId) => {
  // YouTube patterns
  const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/
  const youtubeMatch = url.match(youtubeRegex)
  if (youtubeMatch) {
    const ytVideoId = youtubeMatch[1]
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${ytVideoId}`,
      r2Url: `${R2_BUCKET_URL}/www.youtube.com_watch_v=${ytVideoId}.mp4`,
      thumbnailUrl: `https://img.youtube.com/vi/${ytVideoId}/mqdefault.jpg`
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

  // Check if it's a video file (has video extension)
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv']
  const isVideoFile = videoExtensions.some(ext => url.toLowerCase().endsWith(ext))

  // If it's a video filename without http (e.g., "0002_needle_128.mp4"), load from R2 bucket
  if (isVideoFile && !url.startsWith('http')) {
    return {
      type: 'direct',
      embedUrl: `${R2_BUCKET_URL}/${url}`,
      r2Url: `${R2_BUCKET_URL}/${url}`,
      thumbnailUrl: null
    }
  }

  // Direct video file URL (already has http)
  if (isVideoFile) {
    return {
      type: 'direct',
      embedUrl: url,
      thumbnailUrl: null
    }
  }

  // Other URLs
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
    notes: '',
    is_annotated: 'unannotated'
  })
  const [jsonPreview, setJsonPreview] = useState(null)
  const [editingQuery, setEditingQuery] = useState(null)
  const [editQueryText, setEditQueryText] = useState('')
  const [editingAnnotation, setEditingAnnotation] = useState(null)
  const [editAnnotationData, setEditAnnotationData] = useState({
    start_timestamp: '',
    end_timestamp: '',
    notes: '',
    is_annotated: 'unannotated'
  })

  // Valid query types
  const QUERY_TYPES = ['identity', 'static', 'dynamic', 'causal', 'synchronous', 'sequential', 'periodical', 'negative']

  // Track which dropdown is open (for discrete editing)
  const [openQueryTypeDropdown, setOpenQueryTypeDropdown] = useState(null) // queryId or null
  const [openStatusDropdown, setOpenStatusDropdown] = useState(null) // queryId or null
  const [openAnnotationStatusDropdown, setOpenAnnotationStatusDropdown] = useState(null) // annotationId or null

  const [hoveredAnnotation, setHoveredAnnotation] = useState(null)
  const [showAnnotatorDropdown, setShowAnnotatorDropdown] = useState(false)
  const [selectedAnnotatorFilter, setSelectedAnnotatorFilter] = useState(null)
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [r2Failed, setR2Failed] = useState({}) // Track which videos failed to load from R2

  // Ref for the video player
  const videoPlayerRef = useRef(null)
  const iframePlayerRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showAnnotatorDropdown && !event.target.closest('.export-dropdown-container')) {
        setShowAnnotatorDropdown(false)
      }
      if (showFilterDropdown && !event.target.closest('.filter-dropdown-container')) {
        setShowFilterDropdown(false)
      }
      // Close query_type/status dropdowns when clicking outside
      if (openQueryTypeDropdown !== null && !event.target.closest('[data-dropdown="query_type"]')) {
        setOpenQueryTypeDropdown(null)
      }
      if (openStatusDropdown !== null && !event.target.closest('[data-dropdown="status"]')) {
        setOpenStatusDropdown(null)
      }
      if (openAnnotationStatusDropdown !== null && !event.target.closest('[data-dropdown="annotation-status"]')) {
        setOpenAnnotationStatusDropdown(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showAnnotatorDropdown, showFilterDropdown, openQueryTypeDropdown, openStatusDropdown, openAnnotationStatusDropdown])

  // Auto-play video when entering annotations tab
  useEffect(() => {
    if (activeTab === 'annotations' && selectedVideo) {
      const embedInfo = getVideoEmbedInfo(selectedVideo.url, selectedVideo.id)

      // Small delay to ensure video player is mounted
      const timer = setTimeout(() => {
        if (embedInfo.type === 'direct' && videoPlayerRef.current) {
          // For direct video files, auto-play
          videoPlayerRef.current.play().catch(err => {
            // Ignore autoplay errors (browser may block autoplay)
            console.log('Autoplay prevented:', err)
          })
        } else if (embedInfo.type === 'youtube' && iframePlayerRef.current) {
          // For YouTube, update src with autoplay parameter
          const videoId = selectedVideo.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)[1]
          iframePlayerRef.current.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`
        } else if (embedInfo.type === 'vimeo' && iframePlayerRef.current) {
          // For Vimeo, update src with autoplay parameter
          const vimeoId = selectedVideo.url.match(/(?:vimeo\.com\/)(\d+)/)[1]
          iframePlayerRef.current.src = `https://player.vimeo.com/video/${vimeoId}?autoplay=1`
        }
      }, 100)

      return () => clearTimeout(timer)
    }
  }, [activeTab, selectedVideo])

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

      // Detect if JSON is an array (multiple videos) or object (single video)
      const isMultipleVideos = Array.isArray(jsonPreview)
      const endpoint = isMultipleVideos ? '/api/submit_videos' : '/api/submit_video'

      console.log(`Using endpoint: ${endpoint}`)

      const response = await fetch(endpoint, {
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
        if (isMultipleVideos) {
          setMessage(`Success! Imported ${data.videos_imported || 0} video(s) with ${data.total_queries_created || 0} queries and ${data.total_annotations_created || 0} annotations.`)
        } else {
          setMessage(`Success! Video submitted with ${data.queries_created || 0} queries and ${data.annotations_created || 0} annotations.`)
        }
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
    setShowAnnotatorDropdown(false) // Close dropdown when changing tabs
    setShowFilterDropdown(false) // Close filter dropdown when changing tabs
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
        notes: annotationData.notes,
        is_annotated: annotationData.is_annotated
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
          notes: '',
          is_annotated: 'unannotated'
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
      notes: annotation.notes || '',
      is_annotated: annotation.is_annotated || 'unannotated'
    })
  }

  const handleSaveAnnotation = async (annotationId) => {
    try {
      console.log('Saving annotation:', annotationId, editAnnotationData)

      const response = await fetch(`/api/annotations/${annotationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editAnnotationData),
      })

      console.log('Response status:', response.status)

      const responseData = await response.json()
      console.log('Response data:', responseData)

      if (response.ok && selectedQuery) {
        setEditingAnnotation(null)
        setEditAnnotationData({
          start_timestamp: '00:00:00',
          end_timestamp: '00:00:00',
          notes: '',
          is_annotated: 'unannotated'
        })
        fetchAnnotations(selectedQuery.id)
      } else {
        alert(`Failed to save annotation: ${responseData.message || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error updating annotation:', error)
      alert(`Error saving annotation: ${error.message}`)
    }
  }

  const handleCancelEditAnnotation = () => {
    setEditingAnnotation(null)
    setEditAnnotationData({
      start_timestamp: '00:00:00',
      end_timestamp: '00:00:00',
      notes: '',
      is_annotated: 'unannotated'
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

  const handleUpdateAnnotationStatus = async (annotationId, newStatus) => {
    try {
      const response = await fetch(`/api/annotations/${annotationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_annotated: newStatus }),
      })

      if (response.ok && selectedQuery) {
        fetchAnnotations(selectedQuery.id)
      } else {
        const errorData = await response.json()
        alert(`Failed to update annotation status: ${errorData.message || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error updating annotation status:', error)
      alert(`Error: ${error.message}`)
    }
  }

  const handleMarkQueryVerified = async () => {
    if (!selectedQuery) return

    // Check if all annotations are marked as "annotated"
    const unannotatedCount = annotations.filter(a => a.is_annotated !== 'annotated').length
    if (unannotatedCount > 0) {
      const confirmed = window.confirm(
        `${unannotatedCount} annotation${unannotatedCount > 1 ? 's are' : ' is'} still marked as "unannotated".\n\nAre you sure you want to verify this query?`
      )
      if (!confirmed) return
    }

    try {
      const response = await fetch(`/api/queries/${selectedQuery.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'verified' }),
      })

      if (response.ok) {
        const data = await response.json()
        // Update the selectedQuery with the new status
        setSelectedQuery(data.query)
        // Also refresh queries list if we're on that tab
        fetchQueries(selectedVideo.id)
      } else {
        const errorData = await response.json()
        alert(`Failed to mark query as verified: ${errorData.message || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error marking query as verified:', error)
      alert(`Error: ${error.message}`)
    }
  }

  // Sort annotations: unannotated first, then annotated
  const getSortedAnnotations = () => {
    return [...annotations].sort((a, b) => {
      const aAnnotated = a.is_annotated === 'annotated' ? 1 : 0
      const bAnnotated = b.is_annotated === 'annotated' ? 1 : 0
      return aAnnotated - bAnnotated
    })
  }

  const handleUpdateQueryTypes = async (queryId, newQueryTypes) => {
    try {
      const response = await fetch(`/api/queries/${queryId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query_types: newQueryTypes }),
      })

      if (response.ok) {
        const data = await response.json()
        // Update selectedQuery if it's the one being edited
        if (selectedQuery && selectedQuery.id === queryId) {
          setSelectedQuery(data.query)
        }
        // Refresh queries list
        if (selectedVideo) {
          fetchQueries(selectedVideo.id)
        }
      } else {
        const errorData = await response.json()
        alert(`Failed to update query types: ${errorData.message || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error updating query types:', error)
      alert(`Error: ${error.message}`)
    }
  }

  const handleAddQueryType = (queryId, currentTypes, newType) => {
    if (!currentTypes.includes(newType)) {
      handleUpdateQueryTypes(queryId, [...currentTypes, newType])
    }
    setOpenQueryTypeDropdown(null)
  }

  const handleRemoveQueryType = (queryId, currentTypes, typeToRemove) => {
    if (currentTypes.length > 1) {
      handleUpdateQueryTypes(queryId, currentTypes.filter(t => t !== typeToRemove))
    }
  }

  const handleUpdateQueryStatus = async (queryId, newStatus) => {
    try {
      const response = await fetch(`/api/queries/${queryId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        const data = await response.json()
        // Update selectedQuery if it's the one being edited
        if (selectedQuery && selectedQuery.id === queryId) {
          setSelectedQuery(data.query)
        }
        // Refresh queries list
        if (selectedVideo) {
          fetchQueries(selectedVideo.id)
        }
      } else {
        const errorData = await response.json()
        alert(`Failed to update query status: ${errorData.message || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error updating query status:', error)
      alert(`Error: ${error.message}`)
    }
  }

  const handleAnnotationClick = (annotation) => {
    // Don't jump if we're editing this annotation
    if (editingAnnotation === annotation.id) {
      return
    }

    const startTimeInSeconds = timestampToSeconds(annotation.start_timestamp)

    if (!selectedVideo) return

    const embedInfo = getVideoEmbedInfo(selectedVideo.url, selectedVideo.id)

    // Check if video is playing in HTML5 video element (direct files or R2 backup)
    if (videoPlayerRef.current && videoPlayerRef.current.src) {
      // For direct video files or R2 backups, use the video element's currentTime
      videoPlayerRef.current.currentTime = startTimeInSeconds
      videoPlayerRef.current.play()
    } else if (embedInfo.type === 'youtube') {
      // For YouTube videos in iframe, update the iframe src with the time parameter
      if (iframePlayerRef.current) {
        const videoId = selectedVideo.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)[1]
        iframePlayerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${startTimeInSeconds}&autoplay=1`
      }
    } else if (embedInfo.type === 'vimeo') {
      // For Vimeo videos, update the iframe src with the time parameter
      if (iframePlayerRef.current) {
        const vimeoId = selectedVideo.url.match(/(?:vimeo\.com\/)(\d+)/)[1]
        iframePlayerRef.current.src = `https://player.vimeo.com/video/${vimeoId}#t=${startTimeInSeconds}s&autoplay=1`
      }
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

  // Get unique annotators from videos
  const getUniqueAnnotators = () => {
    const annotators = videos.map(video => video.annotator).filter(Boolean)
    return [...new Set(annotators)].sort()
  }

  // Get filtered videos based on selected annotator
  const getFilteredVideos = () => {
    if (!selectedAnnotatorFilter) {
      return videos
    }
    return videos.filter(video => video.annotator === selectedAnnotatorFilter)
  }

  const handleExportJSON = async (annotatorFilter = null) => {
    try {
      // Fetch all videos
      const videosResponse = await fetch('/api/videos')
      const videosData = await videosResponse.json()

      if (!videosData.videos || videosData.videos.length === 0) {
        alert('No videos to export')
        return
      }

      // Filter videos by annotator if specified
      let videosToExport = videosData.videos
      if (annotatorFilter) {
        videosToExport = videosData.videos.filter(video => video.annotator === annotatorFilter)
        if (videosToExport.length === 0) {
          alert(`No videos found for annotator: ${annotatorFilter}`)
          return
        }
      }

      // Fetch queries and annotations for each video
      const exportData = await Promise.all(
        videosToExport.map(async (video) => {
          // Fetch queries for this video
          const queriesResponse = await fetch(`/api/videos/${video.id}/queries`)
          const queriesData = await queriesResponse.json()

          // Fetch annotations for each query
          const queriesWithAnnotations = await Promise.all(
            (queriesData.queries || []).map(async (query) => {
              const annotationsResponse = await fetch(`/api/queries/${query.id}/annotations`)
              const annotationsData = await annotationsResponse.json()

              return {
                query_text: query.query_text,
                status: query.status,
                query_types: query.query_types,
                annotations: (annotationsData.annotations || []).map(annotation => ({
                  start_timestamp: annotation.start_timestamp,
                  end_timestamp: annotation.end_timestamp,
                  notes: annotation.notes,
                  is_annotated: annotation.is_annotated
                }))
              }
            })
          )

          return {
            url: video.url,
            title: video.title,
            annotator: video.annotator,
            description: video.description || '',
            topic: video.topic || '',
            duration: video.duration,
            queries: queriesWithAnnotations
          }
        })
      )

      // Create and download JSON file
      const jsonString = JSON.stringify(exportData, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const filename = annotatorFilter
        ? `video_annotations_${annotatorFilter.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`
        : `video_annotations_export_${new Date().toISOString().split('T')[0]}.json`
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      setShowAnnotatorDropdown(false) // Close dropdown after export
    } catch (error) {
      console.error('Error exporting JSON:', error)
      alert('Failed to export JSON')
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
                      <br />
                      <strong>Annotator:</strong> {jsonPreview.annotator || 'Not specified'}
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
  "annotator": "John Doe",
  "duration": 180,
  "description": "Video description (optional)",
  "topic": "Video topic/category (optional)",
  "queries": [
    {
      "query_text": "Your query text here",
      "query_types": ["identity", "static"],
      "annotations": [
        {
          "start_timestamp": "00:00:00",
          "end_timestamp": "00:00:05",
          "notes": "Description of what happens",
          "is_annotated": "unannotated"
        }
      ]
    }
  ]
}`}
                </pre>
                <div style={{ marginTop: '10px', fontSize: '13px', color: '#666' }}>
                  <strong>Required fields:</strong>
                  <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                    <li><code>url</code>: Video URL (YouTube, Vimeo, or direct video file)</li>
                    <li><code>title</code>: Video title</li>
                    <li><code>annotator</code>: Name of the person assigned to annotate this video</li>
                    <li><code>duration</code>: Video duration in seconds (e.g., 180 for 3 minutes)</li>
                    <li><code>query_types</code>: Array of query categories (identity, static, dynamic, causal, synchronous, sequential, periodical, negative)</li>
                  </ul>
                  <strong>Optional fields:</strong> description, topic, annotations, is_annotated
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="history-tab">
              <div className="videos-header">
                <h2>Submitted Videos</h2>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div className="filter-dropdown-container" style={{ position: 'relative' }}>
                    <button
                      onClick={() => {
                        setSelectedAnnotatorFilter(null)
                        setShowFilterDropdown(false)
                      }}
                      className="export-btn"
                      style={{
                        background: selectedAnnotatorFilter ? '#2196F3' : '#757575',
                        borderRadius: '4px 0 0 4px'
                      }}
                    >
                      {selectedAnnotatorFilter ? `Filter: ${selectedAnnotatorFilter}` : 'Filter by Annotator'}
                    </button>
                    <button
                      onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                      className="export-btn"
                      style={{
                        background: selectedAnnotatorFilter ? '#1976D2' : '#616161',
                        borderRadius: '0 4px 4px 0',
                        padding: '8px 12px',
                        marginLeft: '-1px',
                        minWidth: 'auto'
                      }}
                      title="Select annotator to filter"
                    >
                      ▼
                    </button>
                    {showFilterDropdown && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        marginTop: '8px',
                        background: 'white',
                        border: '1px solid #e0e0e0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)',
                        minWidth: '240px',
                        zIndex: 1000,
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid #f0f0f0',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          color: '#555',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          background: '#fafafa'
                        }}>
                          Filter by Annotator
                        </div>
                        {getUniqueAnnotators().length === 0 ? (
                          <div style={{
                            padding: '20px 16px',
                            color: '#999',
                            fontSize: '0.9rem',
                            textAlign: 'center'
                          }}>
                            No annotators found
                          </div>
                        ) : (
                          <div className="dropdown-scroll" style={{ padding: '4px 0', maxHeight: '280px', overflowY: 'scroll' }}>
                            {getUniqueAnnotators().map(annotator => (
                              <button
                                key={annotator}
                                onClick={() => {
                                  setSelectedAnnotatorFilter(annotator)
                                  setShowFilterDropdown(false)
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  width: '100%',
                                  padding: '12px 16px',
                                  border: 'none',
                                  background: selectedAnnotatorFilter === annotator ? '#e3f2fd' : 'white',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '0.95rem',
                                  color: '#333',
                                  transition: 'all 0.15s ease',
                                  borderLeft: selectedAnnotatorFilter === annotator ? '3px solid #2196F3' : '3px solid transparent'
                                }}
                                onMouseEnter={(e) => {
                                  if (selectedAnnotatorFilter !== annotator) {
                                    e.target.style.background = '#f8f9fa'
                                    e.target.style.borderLeftColor = '#2196F3'
                                    e.target.style.paddingLeft = '20px'
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (selectedAnnotatorFilter !== annotator) {
                                    e.target.style.background = 'white'
                                    e.target.style.borderLeftColor = 'transparent'
                                    e.target.style.paddingLeft = '16px'
                                  }
                                }}
                              >
                                <span style={{
                                  fontWeight: selectedAnnotatorFilter === annotator ? '600' : '500',
                                  color: '#2c3e50'
                                }}>
                                  {annotator}
                                </span>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  background: selectedAnnotatorFilter === annotator ? '#2196F3' : '#e3f2fd',
                                  color: selectedAnnotatorFilter === annotator ? 'white' : '#2196F3',
                                  fontSize: '0.8rem',
                                  fontWeight: '600'
                                }}>
                                  {videos.filter(v => v.annotator === annotator).length}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="export-dropdown-container" style={{ position: 'relative' }}>
                    <button
                      onClick={() => handleExportJSON()}
                      className="export-btn"
                      style={{ background: '#4CAF50', borderRadius: '4px 0 0 4px' }}
                    >
                      Export JSON
                    </button>
                    <button
                      onClick={() => setShowAnnotatorDropdown(!showAnnotatorDropdown)}
                      className="export-btn"
                      style={{
                        background: '#45a049',
                        borderRadius: '0 4px 4px 0',
                        padding: '8px 12px',
                        marginLeft: '-1px',
                        minWidth: 'auto'
                      }}
                      title="Export by annotator"
                    >
                      ▼
                    </button>
                    {showAnnotatorDropdown && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        marginTop: '8px',
                        background: 'white',
                        border: '1px solid #e0e0e0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)',
                        minWidth: '240px',
                        zIndex: 1000,
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid #f0f0f0',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          color: '#555',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          background: '#fafafa'
                        }}>
                          Export by Annotator
                        </div>
                        {getUniqueAnnotators().length === 0 ? (
                          <div style={{
                            padding: '20px 16px',
                            color: '#999',
                            fontSize: '0.9rem',
                            textAlign: 'center'
                          }}>
                            No annotators found
                          </div>
                        ) : (
                          <div className="dropdown-scroll" style={{ padding: '4px 0', maxHeight: '280px', overflowY: 'scroll' }}>
                            {getUniqueAnnotators().map(annotator => (
                              <button
                                key={annotator}
                                onClick={() => handleExportJSON(annotator)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  width: '100%',
                                  padding: '12px 16px',
                                  border: 'none',
                                  background: 'white',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '0.95rem',
                                  color: '#333',
                                  transition: 'all 0.15s ease',
                                  borderLeft: '3px solid transparent'
                                }}
                                onMouseEnter={(e) => {
                                  e.target.style.background = '#f8f9fa'
                                  e.target.style.borderLeftColor = '#4CAF50'
                                  e.target.style.paddingLeft = '20px'
                                }}
                                onMouseLeave={(e) => {
                                  e.target.style.background = 'white'
                                  e.target.style.borderLeftColor = 'transparent'
                                  e.target.style.paddingLeft = '16px'
                                }}
                              >
                                <span style={{
                                  fontWeight: '500',
                                  color: '#2c3e50'
                                }}>
                                  {annotator}
                                </span>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  background: '#e8f5e9',
                                  color: '#4CAF50',
                                  fontSize: '0.8rem',
                                  fontWeight: '600'
                                }}>
                                  {videos.filter(v => v.annotator === annotator).length}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={fetchVideos} className="refresh-btn">
                    Refresh
                  </button>
                </div>
              </div>

              {videos.length === 0 ? (
                <p className="no-videos">No videos submitted yet</p>
              ) : getFilteredVideos().length === 0 ? (
                <p className="no-videos">No videos found for annotator: {selectedAnnotatorFilter}</p>
              ) : (
                <div className="videos-list">
                  {getFilteredVideos().map((video) => {
                    const embedInfo = getVideoEmbedInfo(video.url, video.id)
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
                          <div className="video-annotator" style={{
                            fontSize: '0.9rem',
                            color: '#555',
                            marginTop: '4px',
                            fontStyle: 'italic'
                          }}>
                            Annotator: {video.annotator}
                          </div>
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
                            <p style={{ marginBottom: '8px' }}>
                              {query.query_text}
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {/* Query Type Badges - Multiple tags with add/remove */}
                              {(query.query_types || ['negative']).map((qType, idx) => (
                                <span
                                  key={`${query.id}-${qType}-${idx}`}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '12px',
                                    fontSize: '0.7rem',
                                    fontWeight: '600',
                                    textTransform: 'uppercase',
                                    background: '#2196F3',
                                    color: 'white',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  {qType}
                                  {(query.query_types || ['negative']).length > 1 && (
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleRemoveQueryType(query.id, query.query_types || ['negative'], qType)
                                      }}
                                      style={{
                                        cursor: 'pointer',
                                        marginLeft: '2px',
                                        fontSize: '0.8rem',
                                        lineHeight: 1,
                                        opacity: 0.8
                                      }}
                                      onMouseEnter={(e) => e.target.style.opacity = '1'}
                                      onMouseLeave={(e) => e.target.style.opacity = '0.8'}
                                    >
                                      ×
                                    </span>
                                  )}
                                </span>
                              ))}
                              {/* Plus button to add more query types */}
                              <div data-dropdown="query_type" style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                                <span
                                  onClick={() => setOpenQueryTypeDropdown(openQueryTypeDropdown === query.id ? null : query.id)}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '12px',
                                    fontSize: '0.7rem',
                                    fontWeight: '600',
                                    background: '#e0e0e0',
                                    color: '#666',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    display: 'inline-block'
                                  }}
                                  onMouseEnter={(e) => { e.target.style.background = '#d0d0d0' }}
                                  onMouseLeave={(e) => { e.target.style.background = '#e0e0e0' }}
                                >
                                  +
                                </span>
                                {openQueryTypeDropdown === query.id && (
                                  <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '4px',
                                    background: 'white',
                                    border: '1px solid #e0e0e0',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    zIndex: 1000,
                                    minWidth: '120px',
                                    overflow: 'hidden',
                                    maxHeight: '200px',
                                    overflowY: 'auto'
                                  }}>
                                    {QUERY_TYPES.filter(qType => !(query.query_types || ['negative']).includes(qType)).map(qType => (
                                      <div
                                        key={qType}
                                        onClick={() => handleAddQueryType(query.id, query.query_types || ['negative'], qType)}
                                        style={{
                                          padding: '8px 12px',
                                          fontSize: '0.8rem',
                                          cursor: 'pointer',
                                          background: 'white',
                                          transition: 'background 0.1s ease'
                                        }}
                                        onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                                        onMouseLeave={(e) => e.target.style.background = 'white'}
                                      >
                                        {qType}
                                      </div>
                                    ))}
                                    {QUERY_TYPES.filter(qType => !(query.query_types || ['negative']).includes(qType)).length === 0 && (
                                      <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#999' }}>
                                        All types added
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Status Badge - Click to edit */}
                              <div data-dropdown="status" style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                                <span
                                  onClick={() => setOpenStatusDropdown(openStatusDropdown === query.id ? null : query.id)}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: '12px',
                                    fontSize: '0.7rem',
                                    fontWeight: '600',
                                    textTransform: 'uppercase',
                                    background: query.status === 'verified' ? '#4CAF50' : '#FF9800',
                                    color: 'white',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    display: 'inline-block'
                                  }}
                                  onMouseEnter={(e) => { e.target.style.opacity = '0.85'; e.target.style.transform = 'scale(1.02)' }}
                                  onMouseLeave={(e) => { e.target.style.opacity = '1'; e.target.style.transform = 'scale(1)' }}
                                >
                                  {query.status || 'unverified'}
                                </span>
                                {openStatusDropdown === query.id && (
                                  <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '4px',
                                    background: 'white',
                                    border: '1px solid #e0e0e0',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    zIndex: 1000,
                                    minWidth: '110px',
                                    overflow: 'hidden'
                                  }}>
                                    {['unverified', 'verified'].map(status => (
                                      <div
                                        key={status}
                                        onClick={() => {
                                          handleUpdateQueryStatus(query.id, status)
                                          setOpenStatusDropdown(null)
                                        }}
                                        style={{
                                          padding: '8px 12px',
                                          fontSize: '0.8rem',
                                          cursor: 'pointer',
                                          background: query.status === status ? (status === 'verified' ? '#e8f5e9' : '#fff3e0') : 'white',
                                          fontWeight: query.status === status ? '600' : '400',
                                          transition: 'background 0.1s ease'
                                        }}
                                        onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                                        onMouseLeave={(e) => e.target.style.background = query.status === status ? (status === 'verified' ? '#e8f5e9' : '#fff3e0') : 'white'}
                                      >
                                        {status}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
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
                <h2>
                  Annotations for: {selectedQuery.query_text}
                  <span style={{
                    marginLeft: '12px',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    background: selectedQuery.status === 'verified' ? '#4CAF50' : '#FF9800',
                    color: 'white'
                  }}>
                    {selectedQuery.status || 'unverified'}
                  </span>
                  {(selectedQuery.query_types || ['negative']).map((qType, idx) => (
                    <span key={idx} style={{
                      marginLeft: idx === 0 ? '8px' : '4px',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      background: '#2196F3',
                      color: 'white'
                    }}>
                      {qType}
                    </span>
                  ))}
                </h2>
              </div>

              {selectedVideo && (
                <div className="video-player-container" style={{
                  marginBottom: '2rem',
                  padding: '1rem',
                  background: '#000',
                  borderRadius: '8px'
                }}>
                  {(() => {
                    const embedInfo = getVideoEmbedInfo(selectedVideo.url, selectedVideo.id)

                    if (embedInfo.type === 'direct') {
                      // Direct video file (MP4, WebM, etc.) or R2 backup
                      return (
                        <div>
                          <div style={{ position: 'relative' }}>
                            <video
                              ref={videoPlayerRef}
                              src={embedInfo.embedUrl}
                              controls
                              style={{
                                width: '100%',
                                maxHeight: '500px',
                                borderRadius: '4px'
                              }}
                            >
                              Your browser does not support the video tag.
                            </video>

                            {/* Annotation markers overlay */}
                            <div style={{
                              position: 'absolute',
                              bottom: '48px',
                              left: '0',
                              right: '0',
                              height: '6px',
                              pointerEvents: 'none',
                              paddingLeft: '12px',
                              paddingRight: '12px'
                            }}>
                              {annotations.map((annotation, index) => {
                                const startSeconds = timestampToSeconds(annotation.start_timestamp)
                                const endSeconds = timestampToSeconds(annotation.end_timestamp)
                                const videoDuration = videoPlayerRef.current?.duration || 0

                                if (!videoDuration) return null

                                const startPercent = (startSeconds / videoDuration) * 100
                                const widthPercent = ((endSeconds - startSeconds) / videoDuration) * 100

                                return (
                                  <div
                                    key={index}
                                    style={{
                                      position: 'absolute',
                                      left: `${startPercent}%`,
                                      width: `${widthPercent}%`,
                                      height: '100%',
                                      background: 'rgba(255, 152, 0, 0.7)',
                                      borderRadius: '2px',
                                      boxShadow: '0 0 4px rgba(255, 152, 0, 0.8)'
                                    }}
                                    title={annotation.notes}
                                  />
                                )
                              })}
                            </div>
                          </div>

                          {/* Annotation timeline (below video) */}
                          <div style={{
                            marginTop: '12px',
                            padding: '8px',
                            background: '#1a1a1a',
                            borderRadius: '4px'
                          }}>
                            <div style={{
                              fontSize: '0.85rem',
                              color: '#999',
                              marginBottom: '6px',
                              fontWeight: '500'
                            }}>
                              Annotation Timeline: {selectedVideo.duration ? `(Video Duration: ${Math.floor(selectedVideo.duration / 60)}:${String(selectedVideo.duration % 60).padStart(2, '0')})` : videoPlayerRef.current?.duration ? `(Video Duration: ${Math.floor(videoPlayerRef.current.duration / 60)}:${String(Math.floor(videoPlayerRef.current.duration % 60)).padStart(2, '0')})` : ''}
                            </div>
                            <div style={{
                              position: 'relative',
                              height: '8px',
                              background: '#333',
                              borderRadius: '4px',
                              overflow: 'hidden'
                            }}>
                              {annotations.map((annotation, index) => {
                                const startSeconds = timestampToSeconds(annotation.start_timestamp)
                                const endSeconds = timestampToSeconds(annotation.end_timestamp)

                                // Use video duration from player or database
                                let videoDuration = videoPlayerRef.current?.duration || selectedVideo.duration || 0
                                if (!videoDuration && annotations.length > 0) {
                                  const maxTimestamp = Math.max(...annotations.map(a =>
                                    timestampToSeconds(a.end_timestamp)
                                  ))
                                  videoDuration = maxTimestamp * 1.2 // Add 20% buffer as fallback
                                }

                                if (!videoDuration) return null

                                const startPercent = (startSeconds / videoDuration) * 100
                                const widthPercent = ((endSeconds - startSeconds) / videoDuration) * 100

                                return (
                                  <div
                                    key={index}
                                    style={{
                                      position: 'absolute',
                                      left: `${startPercent}%`,
                                      width: `${widthPercent}%`,
                                      height: '100%',
                                      background: 'rgba(255, 152, 0, 0.9)',
                                      cursor: 'pointer'
                                    }}
                                    title={`${annotation.start_timestamp} - ${annotation.end_timestamp}: ${annotation.notes}`}
                                    onClick={() => handleAnnotationClick(annotation)}
                                  />
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )
                    } else if (embedInfo.type === 'youtube' && embedInfo.r2Url && !r2Failed[selectedVideo.id]) {
                      // YouTube with R2 backup available - try R2 first
                      return (
                        <div>
                          <div style={{ position: 'relative' }}>
                            <video
                              ref={videoPlayerRef}
                              src={embedInfo.r2Url}
                              controls
                              style={{
                                width: '100%',
                                maxHeight: '500px',
                                borderRadius: '4px'
                              }}
                              onError={() => {
                                // R2 video not found, fallback to YouTube
                                setR2Failed(prev => ({ ...prev, [selectedVideo.id]: true }))
                              }}
                            >
                              Your browser does not support the video tag.
                            </video>

                            {/* Annotation markers overlay */}
                            <div style={{
                              position: 'absolute',
                              bottom: '48px',
                              left: '0',
                              right: '0',
                              height: '6px',
                              pointerEvents: 'none',
                              paddingLeft: '12px',
                              paddingRight: '12px'
                            }}>
                              {annotations.map((annotation, index) => {
                                const startSeconds = timestampToSeconds(annotation.start_timestamp)
                                const endSeconds = timestampToSeconds(annotation.end_timestamp)
                                const videoDuration = videoPlayerRef.current?.duration || 0

                                if (!videoDuration) return null

                                const startPercent = (startSeconds / videoDuration) * 100
                                const widthPercent = ((endSeconds - startSeconds) / videoDuration) * 100

                                return (
                                  <div
                                    key={index}
                                    style={{
                                      position: 'absolute',
                                      left: `${startPercent}%`,
                                      width: `${widthPercent}%`,
                                      height: '100%',
                                      background: 'rgba(255, 152, 0, 0.7)',
                                      borderRadius: '2px',
                                      boxShadow: '0 0 4px rgba(255, 152, 0, 0.8)'
                                    }}
                                    title={annotation.notes}
                                  />
                                )
                              })}
                            </div>
                          </div>

                          {/* Annotation timeline (below video) */}
                          <div style={{
                            marginTop: '12px',
                            padding: '8px',
                            background: '#1a1a1a',
                            borderRadius: '4px'
                          }}>
                            <div style={{
                              fontSize: '0.85rem',
                              color: '#999',
                              marginBottom: '6px',
                              fontWeight: '500'
                            }}>
                              Annotation Timeline: {selectedVideo.duration ? `(Video Duration: ${Math.floor(selectedVideo.duration / 60)}:${String(selectedVideo.duration % 60).padStart(2, '0')})` : videoPlayerRef.current?.duration ? `(Video Duration: ${Math.floor(videoPlayerRef.current.duration / 60)}:${String(Math.floor(videoPlayerRef.current.duration % 60)).padStart(2, '0')})` : ''}
                            </div>
                            <div style={{
                              position: 'relative',
                              height: '8px',
                              background: '#333',
                              borderRadius: '4px',
                              overflow: 'hidden'
                            }}>
                              {annotations.map((annotation, index) => {
                                const startSeconds = timestampToSeconds(annotation.start_timestamp)
                                const endSeconds = timestampToSeconds(annotation.end_timestamp)

                                // Use video duration from player or database
                                let videoDuration = videoPlayerRef.current?.duration || selectedVideo.duration || 0
                                if (!videoDuration && annotations.length > 0) {
                                  const maxTimestamp = Math.max(...annotations.map(a =>
                                    timestampToSeconds(a.end_timestamp)
                                  ))
                                  videoDuration = maxTimestamp * 1.2 // Add 20% buffer as fallback
                                }

                                if (!videoDuration) return null

                                const startPercent = (startSeconds / videoDuration) * 100
                                const widthPercent = ((endSeconds - startSeconds) / videoDuration) * 100

                                return (
                                  <div
                                    key={index}
                                    style={{
                                      position: 'absolute',
                                      left: `${startPercent}%`,
                                      width: `${widthPercent}%`,
                                      height: '100%',
                                      background: 'rgba(255, 152, 0, 0.9)',
                                      cursor: 'pointer'
                                    }}
                                    title={`${annotation.start_timestamp} - ${annotation.end_timestamp}: ${annotation.notes}`}
                                    onClick={() => handleAnnotationClick(annotation)}
                                  />
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )
                    } else {
                      // YouTube/Vimeo iframe (R2 not available or failed)
                      return (
                        <div>
                          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
                            <iframe
                              ref={iframePlayerRef}
                              src={embedInfo.embedUrl}
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                border: 'none',
                                borderRadius: '4px'
                              }}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>

                          {/* Annotation timeline for YouTube/Vimeo (below video) */}
                          <div style={{
                            marginTop: '12px',
                            padding: '8px',
                            background: '#1a1a1a',
                            borderRadius: '4px'
                          }}>
                            <div style={{
                              fontSize: '0.85rem',
                              color: '#999',
                              marginBottom: '6px',
                              fontWeight: '500'
                            }}>
                              Annotation Timeline: {selectedVideo.duration ? `(Video Duration: ${Math.floor(selectedVideo.duration / 60)}:${String(selectedVideo.duration % 60).padStart(2, '0')})` : ''}
                            </div>
                            <div style={{
                              position: 'relative',
                              height: '8px',
                              background: '#333',
                              borderRadius: '4px',
                              overflow: 'hidden'
                            }}>
                              {annotations.map((annotation, index) => {
                                const startSeconds = timestampToSeconds(annotation.start_timestamp)
                                const endSeconds = timestampToSeconds(annotation.end_timestamp)

                                // Use video duration if available, otherwise estimate from annotations
                                let videoDuration = selectedVideo.duration || 0
                                if (!videoDuration && annotations.length > 0) {
                                  const maxTimestamp = Math.max(...annotations.map(a =>
                                    timestampToSeconds(a.end_timestamp)
                                  ))
                                  videoDuration = maxTimestamp * 1.2 // Add 20% buffer as fallback
                                }

                                if (!videoDuration) return null

                                const startPercent = (startSeconds / videoDuration) * 100
                                const widthPercent = ((endSeconds - startSeconds) / videoDuration) * 100

                                return (
                                  <div
                                    key={index}
                                    style={{
                                      position: 'absolute',
                                      left: `${startPercent}%`,
                                      width: `${widthPercent}%`,
                                      height: '100%',
                                      background: 'rgba(255, 152, 0, 0.9)',
                                      cursor: 'pointer'
                                    }}
                                    title={`${annotation.start_timestamp} - ${annotation.end_timestamp}: ${annotation.notes}`}
                                    onClick={() => handleAnnotationClick(annotation)}
                                  />
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )
                    }
                  })()}
                </div>
              )}

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
                  <label htmlFor="notes">Description (optional):</label>
                  <textarea
                    id="notes"
                    value={annotationData.notes}
                    onChange={(e) => setAnnotationData({...annotationData, notes: e.target.value})}
                    placeholder="Describe what happens in this time range..."
                    rows="4"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="is_annotated">Annotation Status:</label>
                  <select
                    id="is_annotated"
                    value={annotationData.is_annotated}
                    onChange={(e) => setAnnotationData({...annotationData, is_annotated: e.target.value})}
                    style={{ width: '100%', padding: '8px' }}
                  >
                    <option value="unannotated">unannotated</option>
                    <option value="annotated">annotated</option>
                  </select>
                </div>

                <button type="submit">Add Annotation</button>
              </form>

              <div className="annotations-list">
                <h3>All Annotations ({annotations.length})</h3>
                {annotations.length === 0 ? (
                  <p className="no-annotations">No annotations yet. Add one above!</p>
                ) : (
                  getSortedAnnotations().map((annotation) => (
                    <div
                      key={annotation.id}
                      className="annotation-item"
                      onClick={() => handleAnnotationClick(annotation)}
                      style={{
                        cursor: editingAnnotation === annotation.id ? 'default' : 'pointer'
                      }}
                    >
                      {editingAnnotation === annotation.id ? (
                        <div
                          className="annotation-edit-form"
                          style={{ width: '100%' }}
                          onClick={(e) => e.stopPropagation()}
                        >
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
                          <div className="form-group">
                            <label>Status:</label>
                            <select
                              value={editAnnotationData.is_annotated || 'unannotated'}
                              onChange={(e) => setEditAnnotationData({...editAnnotationData, is_annotated: e.target.value})}
                              style={{ width: '100%', padding: '8px', marginBottom: '8px' }}
                            >
                              <option value="unannotated">unannotated</option>
                              <option value="annotated">annotated</option>
                            </select>
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                              {/* Annotation Status Badge - Click to edit */}
                              <div data-dropdown="annotation-status" style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                                <span
                                  onClick={() => setOpenAnnotationStatusDropdown(openAnnotationStatusDropdown === annotation.id ? null : annotation.id)}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: '12px',
                                    fontSize: '0.7rem',
                                    fontWeight: '600',
                                    textTransform: 'uppercase',
                                    background: annotation.is_annotated === 'annotated' ? '#4CAF50' : '#9e9e9e',
                                    color: 'white',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    display: 'inline-block'
                                  }}
                                  onMouseEnter={(e) => { e.target.style.opacity = '0.85'; e.target.style.transform = 'scale(1.02)' }}
                                  onMouseLeave={(e) => { e.target.style.opacity = '1'; e.target.style.transform = 'scale(1)' }}
                                >
                                  {annotation.is_annotated || 'unannotated'}
                                </span>
                                {openAnnotationStatusDropdown === annotation.id && (
                                  <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    marginTop: '4px',
                                    background: 'white',
                                    border: '1px solid #e0e0e0',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    zIndex: 1000,
                                    minWidth: '120px',
                                    overflow: 'hidden'
                                  }}>
                                    {['unannotated', 'annotated'].map(status => (
                                      <div
                                        key={status}
                                        onClick={() => {
                                          handleUpdateAnnotationStatus(annotation.id, status)
                                          setOpenAnnotationStatusDropdown(null)
                                        }}
                                        style={{
                                          padding: '8px 12px',
                                          fontSize: '0.8rem',
                                          cursor: 'pointer',
                                          background: annotation.is_annotated === status ? (status === 'annotated' ? '#e8f5e9' : '#f5f5f5') : 'white',
                                          fontWeight: annotation.is_annotated === status ? '600' : '400',
                                          transition: 'background 0.1s ease'
                                        }}
                                        onMouseEnter={(e) => e.target.style.background = '#f5f5f5'}
                                        onMouseLeave={(e) => e.target.style.background = annotation.is_annotated === status ? (status === 'annotated' ? '#e8f5e9' : '#f5f5f5') : 'white'}
                                      >
                                        {status}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <span className="annotation-date">
                              {new Date(annotation.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div
                            style={{ display: 'flex', gap: '8px' }}
                            onClick={(e) => e.stopPropagation()}
                          >
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

              {/* Query Confirmation Section */}
              <div style={{
                marginTop: '2rem',
                padding: '1.5rem',
                background: selectedQuery.status === 'verified' ? '#E8F5E9' : '#FFF3E0',
                borderRadius: '8px',
                border: `2px solid ${selectedQuery.status === 'verified' ? '#4CAF50' : '#FF9800'}`
              }}>
                <h3 style={{
                  marginTop: 0,
                  marginBottom: '1rem',
                  color: selectedQuery.status === 'verified' ? '#2E7D32' : '#E65100'
                }}>
                  {selectedQuery.status === 'verified' ? 'Query Verified' : 'Confirm Annotations'}
                </h3>

                {selectedQuery.status === 'verified' ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    color: '#2E7D32'
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <span style={{ fontSize: '1rem', fontWeight: '500' }}>
                      This query has been verified. All annotations are confirmed as correct.
                    </span>
                  </div>
                ) : (
                  <>
                    <p style={{
                      marginTop: 0,
                      marginBottom: '1rem',
                      color: '#5D4037'
                    }}>
                      Review all annotations above. Once you've confirmed they are correct, click the button below to mark this query as verified.
                    </p>
                    <button
                      onClick={handleMarkQueryVerified}
                      style={{
                        background: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '6px',
                        fontSize: '1rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = '#45a049'
                        e.target.style.transform = 'translateY(-2px)'
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = '#4CAF50'
                        e.target.style.transform = 'translateY(0)'
                      }}
                    >
                      ✓ Confirm & Mark Query as Verified
                    </button>
                  </>
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
