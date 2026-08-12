import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { installMockApi } from './mockApi.js'
import './index.css'

installMockApi() // Electron이 아니면 미리보기용 가짜 백엔드 주입

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
