import { useState } from 'react'
import { api, deadlineStatus, formatDeadline } from '../api'

function Column(props) {
  const { column, cards, labels, isFirst, isLast, onChanged, onOpenCard,
    dragCardId, setDragCardId, dropTarget, setDropTarget, onDrop } = props

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(column.title)
  const [adding, setAdding] = useState(false)
  const [newCard, setNewCard] = useState('')
  const [menu, setMenu] = useState(false)

  async function rename() {
    setEditing(false)
    if (!title.trim() || title === column.title) {
      setTitle(column.title)
      return
    }
    try {
      await api('/columns/' + column.id, 'PUT', { title })
      onChanged()
    } catch (err) {
      alert(err.message)
    }
  }

  async function remove() {
    setMenu(false)
    if (!window.confirm(`Удалить колонку "${column.title}" вместе с карточками?`)) return
    await api('/columns/' + column.id, 'DELETE')
    onChanged()
  }

  async function moveColumn(direction) {
    setMenu(false)
    await api(`/columns/${column.id}/move`, 'PUT', { direction })
    onChanged()
  }

  async function addCard(e) {
    e.preventDefault()
    if (!newCard.trim()) return
    try {
      await api(`/columns/${column.id}/cards`, 'POST', { title: newCard })
      setNewCard('')
      onChanged()
    } catch (err) {
      alert(err.message)
    }
  }

  // определяем куда вставлять: перед карточкой или после (по середине карточки)
  function cardDragOver(e, card) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    let beforeCardId = card.id
    if (after) {
      const all = column.cards
      let next = all.findIndex(c => c.id === card.id) + 1
      // пропускаем саму перетаскиваемую карточку
      if (next < all.length && all[next].id === dragCardId) next++
      beforeCardId = next < all.length ? all[next].id : null
    }
    if (!dropTarget || dropTarget.columnId !== column.id || dropTarget.beforeCardId !== beforeCardId) {
      setDropTarget({ columnId: column.id, beforeCardId })
    }
  }

  function columnDragOver(e) {
    e.preventDefault()
    if (!dropTarget || dropTarget.columnId !== column.id) {
      setDropTarget({ columnId: column.id, beforeCardId: null })
    }
  }

  const isDropHere = dragCardId && dropTarget && dropTarget.columnId === column.id

  return (
    <div
      className={'column' + (isDropHere ? ' column-drop' : '')}
      onDragOver={columnDragOver}
      onDrop={e => { e.preventDefault(); onDrop(column.id) }}
    >
      <div className="column-header">
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={rename}
            onKeyDown={e => e.key === 'Enter' && rename()}
          />
        ) : (
          <h3 onClick={() => setEditing(true)} title="Нажмите чтобы переименовать">{column.title}</h3>
        )}
        <span className="column-count">{column.cards.length}</span>
        <button className="btn-icon" onClick={() => setMenu(!menu)}>⋯</button>
        {menu && (
          <div className="dropdown">
            <div onClick={() => { setMenu(false); setEditing(true) }}>Переименовать</div>
            {!isFirst && <div onClick={() => moveColumn('left')}>Сдвинуть влево</div>}
            {!isLast && <div onClick={() => moveColumn('right')}>Сдвинуть вправо</div>}
            <div className="danger" onClick={remove}>Удалить колонку</div>
          </div>
        )}
      </div>

      <div className="cards">
        {cards.map(card => {
          const status = deadlineStatus(card.deadline)
          const showLine = isDropHere && dropTarget.beforeCardId === card.id && dragCardId !== card.id
          return (
            <div key={card.id}>
              {showLine && <div className="drop-line" />}
              <div
                className={'card' + (dragCardId === card.id ? ' card-dragging' : '')}
                draggable
                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragCardId(card.id) }}
                onDragEnd={() => { setDragCardId(null); setDropTarget(null) }}
                onDragOver={e => cardDragOver(e, card)}
                onClick={() => onOpenCard(card.id)}
              >
                {card.labels.length > 0 && (
                  <div className="card-labels">
                    {card.labels.map(lid => {
                      const l = labels.find(x => x.id === lid)
                      return l ? <span key={lid} className="label" style={{ background: l.color }}>{l.name}</span> : null
                    })}
                  </div>
                )}
                <div className="card-title">{card.title}</div>
                <div className="card-badges">
                  {card.deadline && (
                    <span className={'badge deadline ' + status}>⏰ {formatDeadline(card.deadline)}</span>
                  )}
                  {card.description && <span className="badge" title="Есть описание">☰</span>}
                  {card.comments_count > 0 && <span className="badge">💬 {card.comments_count}</span>}
                  {card.attachments_count > 0 && <span className="badge">📎 {card.attachments_count}</span>}
                  {card.checklist_total > 0 && (
                    <span className={'badge' + (card.checklist_done === card.checklist_total ? ' done' : '')}>
                      ☑ {card.checklist_done}/{card.checklist_total}
                    </span>
                  )}
                  {card.assignee_name && (
                    <span className="avatar avatar-small" title={'Исполнитель: ' + card.assignee_name}>
                      {card.assignee_name[0].toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {isDropHere && dropTarget.beforeCardId === null && <div className="drop-line" />}
      </div>

      {adding ? (
        <form className="add-card" onSubmit={addCard}>
          <textarea
            autoFocus
            placeholder="Название карточки"
            value={newCard}
            onChange={e => setNewCard(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) addCard(e)
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <div className="row">
            <button className="btn btn-primary" type="submit">Добавить</button>
            <button className="btn" type="button" onClick={() => { setAdding(false); setNewCard('') }}>✕</button>
          </div>
        </form>
      ) : (
        <div className="add-card-btn" onClick={() => setAdding(true)}>+ Добавить карточку</div>
      )}
    </div>
  )
}

export default Column
