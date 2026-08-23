import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Analysis from './pages/Analysis'
import Practice from './pages/Practice'
import Play from './pages/Play'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/play" element={<Play />} />
      </Routes>
    </BrowserRouter>
  )
}
