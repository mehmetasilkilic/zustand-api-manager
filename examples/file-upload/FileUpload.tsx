import React, { useState } from 'react'
import { useApiMutation } from 'zustand-api-manager'

interface UploadResponse {
  url: string
  filename: string
}

const api = {
  uploadFile: async (file: File): Promise<{ data: UploadResponse }> => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) throw new Error('Upload failed')
    const data = await response.json()
    return { data }
  }
}

export default function FileUpload() {
  const [file, setFile] = useState<File | null>(null)

  const { mutate, isLoading, isSuccess, data, error, reset } = useApiMutation<
    UploadResponse,
    File
  >('fileUpload', api.uploadFile)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0])
      reset() // Clear previous upload state
    }
  }

  const handleUpload = async () => {
    if (!file) return

    const controller = new AbortController()

    await mutate(file, {
      signal: controller.signal,
      timeout: 30000, // 30 second timeout
      onSuccess: result => {
        console.log('File uploaded:', result.url)
      },
      onError: err => {
        if (err.code === 'TIMEOUT') {
          console.error('Upload timed out')
        } else if (err.code === 'ABORT_ERR') {
          console.error('Upload cancelled')
        } else {
          console.error('Upload failed:', err.message)
        }
      }
    })
  }

  return (
    <div>
      <h2>File Upload</h2>

      <input type="file" onChange={handleFileChange} disabled={isLoading} />

      <button onClick={handleUpload} disabled={!file || isLoading}>
        {isLoading ? 'Uploading...' : 'Upload'}
      </button>

      {isLoading && (
        <div>
          <progress />
          <p>Uploading...</p>
        </div>
      )}

      {isSuccess && data && (
        <div style={{ color: 'green' }}>
          <p>✓ File uploaded successfully!</p>
          <p>
            URL: <a href={data.url}>{data.filename}</a>
          </p>
        </div>
      )}

      {error && <div style={{ color: 'red' }}>Error: {error.message}</div>}
    </div>
  )
}
