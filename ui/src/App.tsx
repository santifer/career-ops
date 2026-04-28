import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Overview } from './pages/Overview'
import { Pipeline } from './pages/Pipeline'
import { Tracker } from './pages/Tracker'
import { Reports } from './pages/Reports'
import { Report } from './pages/Report'
import { Actions } from './pages/Actions'
import { Patterns } from './pages/Patterns'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="tracker" element={<Tracker />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/:id" element={<Report />} />
          <Route path="actions" element={<Actions />} />
          <Route path="patterns" element={<Patterns />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
