import axios, { type AxiosError } from 'axios'

export interface ApiErrorWithDetail extends Error {
  extractedDetail?: string
  response?: any
}

export const apiClient = axios.create({
  baseURL: '',
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string; message?: string }>) => {
    let extractedDetail = 'An unexpected error occurred'
    if (error.response?.data?.detail) {
      extractedDetail = error.response.data.detail
    } else if (error.response?.data?.message) {
      extractedDetail = error.response.data.message
    } else if (error.message) {
      extractedDetail = error.message
    }
    const enhancedError: ApiErrorWithDetail = new Error(extractedDetail)
    enhancedError.extractedDetail = extractedDetail
    enhancedError.response = error.response
    return Promise.reject(enhancedError)
  }
)

export default apiClient
