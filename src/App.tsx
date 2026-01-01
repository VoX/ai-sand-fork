import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadNewImage = () => {
    setLoading(true)
    setError(false)
    // Lorem Picsum provides reliable random images
    // Using random seed to get different images each time
    const seed = Math.random().toString(36).substring(7)
    const url = `https://picsum.photos/seed/${seed}/800/600`
    setImageUrl(url)
  }

  useEffect(() => {
    loadNewImage()
  }, [])

  const handleImageLoad = () => {
    setLoading(false)
  }

  const handleImageError = () => {
    setLoading(false)
    setError(true)
  }

  return (
    <div className="container">
      <h1>Random Photo</h1>
      <div className="image-container">
        {loading && <div className="loading">Loading...</div>}
        {error && <div className="error">Failed to load image</div>}
        {imageUrl && (
          <img
            src={imageUrl}
            alt="Random photo"
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{ display: loading ? 'none' : 'block' }}
          />
        )}
      </div>
      <button onClick={loadNewImage} disabled={loading}>
        {loading ? 'Loading...' : 'New Photo'}
      </button>
    </div>
  )
}

export default App
