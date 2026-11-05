import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'

const boardColors = ['#0079bf', '#d29034', '#519839', '#b04632', '#89609e', '#cd5a91', '#4bbf6b', '#00aecc']

function Boards() {
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState('basic')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    loadBoards()
  }, [])

  async function loadBoards() {
    try {
      const data = await api('/boards')
      setBoards(data)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  async function createBoard(e) {
    e.preventDefault()
    if (!title.trim()) return
    try {
      const data = await api('/boards', 'POST', { title, description, template })
      navigate('/board/' + data.id)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="page">Загрузка...</div>

  return (
    <div className="page">
      <h2>Мои доски</h2>
      {error && <div className="error">{error}</div>}

      <div className="boards-list">
        {boards.map(b => (
          <Link key={b.id} to={'/board/' + b.id} className="board-tile" style={{ background: boardColors[b.id % boardColors.length] }}>
            <div className="board-tile-title">{b.title}</div>
            {b.description && <div className="board-tile-desc">{b.description}</div>}
            <div className="board-tile-info">
              Владелец: {b.owner_name} · участников: {b.members_count}
            </div>
          </Link>
        ))}

        {!showForm ? (
          <div className="board-tile board-tile-new" onClick={() => setShowForm(true)}>
            + Создать доску
          </div>
        ) : (
          <form className="board-tile board-form" onSubmit={createBoard}>
            <input autoFocus placeholder="Название доски" value={title} onChange={e => setTitle(e.target.value)} />
            <input placeholder="Описание (необязательно)" value={description} onChange={e => setDescription(e.target.value)} />
            <select value={template} onChange={e => setTemplate(e.target.value)}>
              <option value="basic">Шаблон: Простой (3 колонки)</option>
              <option value="scrum">Шаблон: Scrum</option>
              <option value="study">Шаблон: Учеба</option>
              <option value="empty">Пустая доска</option>
            </select>
            <div className="row">
              <button className="btn btn-primary" type="submit">Создать</button>
              <button className="btn" type="button" onClick={() => setShowForm(false)}>Отмена</button>
            </div>
          </form>
        )}
      </div>

      {boards.length === 0 && !showForm && (
        <p className="muted">У вас пока нет досок. Создайте первую!</p>
      )}
    </div>
  )
}

export default Boards
