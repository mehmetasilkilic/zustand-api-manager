import React, { useState } from 'react'
import { createApiComposer, ApiMutationEndpoint } from 'zustand-api-manager'

interface UploadResponse {
  url: string
  filename: string
}

const api = {
  uploadFile: async (file: File): Promise<UploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) throw new Error('Upload failed')
    return response.json()
  }
}

interface UploadApi {
  uploadFile: ApiMutationEndpoint<File, UploadResponse>
}

const useApi = createApiComposer<UploadApi>({
  mutations: {
    uploadFile: (file) => api.uploadFile(file)
  }
})

export default function FileUpload() {
  const [file, setFile] = useState<File | null>(null)

  const { mutate, isLoading, isSuccess, data, error, reset } = useApi('uploadFile')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0])
      reset()
    }
  }

  const handleUpload = async () => {
    if (!file) return

    const controller = new AbortController()

    await mutate(file, {
      signal: controller.signal,
      timeout: 30000,
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
          <p>File uploaded successfully!</p>
          <p>
            URL: <a href={data.url}>{data.filename}</a>
          </p>
        </div>
      )}

      {error && <div style={{ color: 'red' }}>Error: {error.message}</div>}
    </div>
  )
}
