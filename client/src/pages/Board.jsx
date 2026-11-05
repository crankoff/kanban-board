import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { io } from 'socket.io-client'
import { api } from '../api'
import Column from '../components/Column.jsx'
import CardModal from '../components/CardModal.jsx'
import Sidebar from '../components/Sidebar.jsx'

function Board({ user }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [board, setBoard] = useState(null)
  const [error, setError] = useState('')
  const [openCardId, setOpenCardId] = useState(null)
  const [sidebar, setSidebar] = useState(null) // 'menu' | null
  const [reloadKey, setReloadKey] = useState(0)

  // фильтры
  const [search, setSearch] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')

  // drag and drop
  const [dragCardId, setDragCardId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)

  const [newColumn, setNewColumn] = useState('')
  const [editTitle, setEditTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')

  useEffect(() => {
    loadBoard()

    const socket = io()
    socket.emit('join_board', id)
    socket.on('board_changed', () => {
      loadBoard()
      setReloadKey(k => k + 1)
    })

    return () => {
      socket.emit('leave_board', id)
      socket.disconnect()
    }
  }, [id])

  async function loadBoard() {
    try {
      const data = await api('/boards/' + id)
      setBoard(data)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const isOwner = board && board.owner_id === user.id

  async function saveTitle() {
    setEditTitle(false)
    if (!titleValue.trim() || titleValue === board.title) return
    try {
      await api('/boards/' + id, 'PUT', { title: titleValue, description: board.description })
      loadBoard()
    } catch (err) {
      alert(err.message)
    }
  }

  async function addColumn(e) {
    e.preventDefault()
    if (!newColumn.trim()) return
    try {
      await api(`/boards/${id}/columns`, 'POST', { title: newColumn })
      setNewColumn('')
      loadBoard()
    } catch (err) {
      alert(err.message)
    }
  }

  async function deleteBoard() {
    if (!window.confirm('Удалить доску со всеми карточками?')) return
    await api('/boards/' + id, 'DELETE')
    navigate('/')
  }

  async function leaveBoard() {
    if (!window.confirm('Покинуть доску?')) return
    await api(`/boards/${id}/members/${user.id}`, 'DELETE')
    navigate('/')
  }

  // ---- перемещение карточек ----

  function handleDrop(columnId) {
    if (!dragCardId) return
    let beforeCardId = null
    if (dropTarget && dropTarget.columnId === columnId) {
      beforeCardId = dropTarget.beforeCardId
    }
    moveCard(dragCardId, columnId, beforeCardId)
    setDragCardId(null)
    setDropTarget(null)
  }

  async function moveCard(cardId, columnId, beforeCardId) {
    const column = board.columns.find(c => c.id === columnId)
    const list = column.cards.filter(c => c.id !== cardId)
    let position = beforeCardId ? list.findIndex(c => c.id === beforeCardId) : list.length
    if (position < 0) position = list.length

    // сразу обновляем на экране, не дожидаясь сервера
    let movedCard = null
    board.columns.forEach(col => {
      const found = col.cards.find(c => c.id === cardId)
      if (found) movedCard = found
    })
    const newColumns = board.columns.map(col => ({ ...col, cards: col.cards.filter(c => c.id !== cardId) }))
    const target = newColumns.find(c => c.id === columnId)
    target.cards.splice(position, 0, { ...movedCard, column_id: columnId })
    setBoard({ ...board, columns: newColumns })

    try {
      await api(`/cards/${cardId}/move`, 'PUT', { columnId, position })
    } catch (err) {
      alert(err.message)
      loadBoard()
    }
  }

  function filterCard(card) {
    if (search) {
      const s = search.toLowerCase()
      const inTitle = card.title.toLowerCase().includes(s)
      const inDesc = (card.description || '').toLowerCase().includes(s)
      if (!inTitle && !inDesc) return false
    }
    if (labelFilter && !card.labels.includes(Number(labelFilter))) return false
    if (assigneeFilter === 'none' && card.assignee_id) return false
    if (assigneeFilter && assigneeFilter !== 'none' && card.assignee_id !== Number(assigneeFilter)) return false
    return true
  }

  if (error) {
    return (
      <div className="page">
        <div className="error">{error}</div>
        <Link to="/">← К списку досок</Link>
      </div>
    )
  }
  if (!board) return <div className="page">Загрузка...</div>

  const filterActive = search || labelFilter || assigneeFilter

  return (
    <div className="board-page">
      <div className="board-header">
        {editTitle ? (
          <input
            className="board-title-input"
            autoFocus
            value={titleValue}
            onChange={e => setTitleValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => e.key === 'Enter' && saveTitle()}
          />
        ) : (
          <h2 className="board-title" title="Нажмите чтобы переименовать" onClick={() => { setTitleValue(board.title); setEditTitle(true) }}>
            {board.title}
          </h2>
        )}

        <div className="members-mini">
          {board.members.map(m => (
            <span key={m.id} className="avatar" title={m.name + (m.role === 'owner' ? ' (владелец)' : '')}>
              {m.name[0].toUpperCase()}
            </span>
          ))}
        </div>

        <div className="board-header-right">
          <button className="btn btn-light" onClick={() => setSidebar(sidebar ? null : 'menu')}>Меню</button>
          {isOwner
            ? <button className="btn btn-light" onClick={deleteBoard}>Удалить доску</button>
            : <button className="btn btn-light" onClick={leaveBoard}>Покинуть доску</button>}
        </div>
      </div>

      <div className="filters">
        <input placeholder="Поиск по карточкам..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={labelFilter} onChange={e => setLabelFilter(e.target.value)}>
          <option value="">Все метки</option>
          {board.labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
          <option value="">Все исполнители</option>
          <option value={user.id}>Мои карточки</option>
          <option value="none">Без исполнителя</option>
          {board.members.filter(m => m.id !== user.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {filterActive && (
          <button className="btn btn-light" onClick={() => { setSearch(''); setLabelFilter(''); setAssigneeFilter('') }}>
            Сбросить
          </button>
        )}
      </div>

      <div className="board-content">
        <div className="columns">
          {board.columns.map((col, index) => (
            <Column
              key={col.id}
              column={col}
              cards={col.cards.filter(filterCard)}
              labels={board.labels}
              isFirst={index === 0}
              isLast={index === board.columns.length - 1}
              onChanged={loadBoard}
              onOpenCard={setOpenCardId}
              dragCardId={dragCardId}
              setDragCardId={setDragCardId}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              onDrop={handleDrop}
            />
          ))}

          <form className="column column-new" onSubmit={addColumn}>
            <input placeholder="+ Добавить колонку" value={newColumn} onChange={e => setNewColumn(e.target.value)} />
            {newColumn && <button className="btn btn-primary" type="submit">Добавить</button>}
          </form>
        </div>

        {sidebar && (
          <Sidebar
            board={board}
            user={user}
            isOwner={isOwner}
            reloadKey={reloadKey}
            onChanged={loadBoard}
            onClose={() => setSidebar(null)}
          />
        )}
      </div>

      {openCardId && (
        <CardModal
          cardId={openCardId}
          board={board}
          user={user}
          reloadKey={reloadKey}
          onChanged={loadBoard}
          onClose={() => setOpenCardId(null)}
        />
      )}
    </div>
  )
}

export default Board
