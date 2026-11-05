import { useState } from 'react'
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Boards from './pages/Boards.jsx'
import Board from './pages/Board.jsx'

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user')
    return saved ? JSON.parse(saved) : null
  })
  const navigate = useNavigate()

  function onLogin(data) {
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    setUser(data.user)
    navigate('/')
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    navigate('/login')
  }

  return (
    <div className="app">
      <header className="header">
        <Link to="/" className="logo">Kanban</Link>
        {user && (
          <div className="header-right">
            <span className="avatar" title={user.email}>{user.name[0].toUpperCase()}</span>
            <span>{user.name}</span>
            <button className="btn btn-light" onClick={logout}>Выйти</button>
          </div>
        )}
      </header>

      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login onLogin={onLogin} />} />
        <Route path="/register" element={user ? <Navigate to="/" /> : <Register onLogin={onLogin} />} />
        <Route path="/" element={user ? <Boards /> : <Navigate to="/login" />} />
        <Route path="/board/:id" element={user ? <Board user={user} /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  )
}

export default App
