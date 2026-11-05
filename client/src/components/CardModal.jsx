import { useEffect, useState } from 'react'
import { api, uploadFile, fileUrl, formatSize, formatDate, deadlineStatus } from '../api'

function CardModal({ cardId, board, user, reloadKey, onChanged, onClose }) {
  const [card, setCard] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [editDesc, setEditDesc] = useState(false)
  const [comment, setComment] = useState('')
  const [checkText, setCheckText] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadCard(true)
  }, [cardId])

  // если кто-то другой поменял карточку - подгружаем заново
  useEffect(() => {
    if (reloadKey > 0) loadCard(false)
  }, [reloadKey])

  async function loadCard(first) {
    try {
      const data = await api('/cards/' + cardId)
      setCard(data)
      if (first) {
        setTitle(data.title)
        setDescription(data.description || '')
      }
    } catch (err) {
      // карточку могли удалить
      setError(err.message)
    }
  }

  async function update(fields) {
    try {
      await api('/cards/' + cardId, 'PUT', fields)
      await loadCard(false)
      onChanged()
    } catch (err) {
      alert(err.message)
    }
  }

  function saveTitle() {
    if (!title.trim()) {
      setTitle(card.title)
      return
    }
    if (title !== card.title) update({ title })
  }

  function saveDescription() {
    setEditDesc(false)
    update({ description })
  }

  async function toggleLabel(labelId) {
    const has = card.labels.includes(labelId)
    await api(`/cards/${cardId}/labels/${labelId}`, has ? 'DELETE' : 'POST')
    loadCard(false)
    onChanged()
  }

  async function addComment(e) {
    e.preventDefault()
    if (!comment.trim()) return
    await api(`/cards/${cardId}/comments`, 'POST', { text: comment })
    setComment('')
    loadCard(false)
    onChanged()
  }

  async function deleteComment(id) {
    if (!window.confirm('Удалить комментарий?')) return
    await api('/comments/' + id, 'DELETE')
    loadCard(false)
    onChanged()
  }

  async function addCheckItem(e) {
    e.preventDefault()
    if (!checkText.trim()) return
    await api(`/cards/${cardId}/checklist`, 'POST', { text: checkText })
    setCheckText('')
    loadCard(false)
    onChanged()
  }

  async function toggleCheckItem(item) {
    await api('/checklist/' + item.id, 'PUT', { done: !item.done })
    loadCard(false)
    onChanged()
  }

  async function deleteCheckItem(item) {
    await api('/checklist/' + item.id, 'DELETE')
    loadCard(false)
    onChanged()
  }

  async function handleFile(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      alert('Файл больше 10 МБ')
      return
    }
    setUploading(true)
    try {
      await uploadFile(`/cards/${cardId}/attachments`, file)
      loadCard(false)
      onChanged()
    } catch (err) {
      alert(err.message)
    }
    setUploading(false)
  }

  async function deleteFile(file) {
    if (!window.confirm(`Удалить файл "${file.original_name}"?`)) return
    await api('/attachments/' + file.id, 'DELETE')
    loadCard(false)
    onChanged()
  }

  async function deleteCard() {
    if (!window.confirm('Удалить карточку?')) return
    await api('/cards/' + cardId, 'DELETE')
    onChanged()
    onClose()
  }

  if (error) {
    return (
      <div className="modal-bg" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="error">{error}</div>
          <button className="btn" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    )
  }

  if (!card) return null

  const doneCount = card.checklist.filter(i => i.done).length
  const percent = card.checklist.length ? Math.round(doneCount / card.checklist.length * 100) : 0

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <input
          className="modal-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={e => e.key === 'Enter' && e.target.blur()}
        />
        <div className="muted small">
          в колонке <b>{card.column_title}</b>
          {card.author_name && <> · создал(а) {card.author_name} {formatDate(card.created_at)}</>}
        </div>

        <div className="modal-body">
          <div className="modal-main">
            <div className="modal-row">
              <div>
                <div className="field-label">Исполнитель</div>
                <select
                  value={card.assignee_id || ''}
                  onChange={e => update({ assigneeId: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Не назначен</option>
                  {board.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <div className="field-label">Дедлайн</div>
                <input
                  type="date"
                  className={'deadline-input ' + deadlineStatus(card.deadline)}
                  value={card.deadline || ''}
                  onChange={e => update({ deadline: e.target.value })}
                />
                {card.deadline && (
                  <button className="btn-link" onClick={() => update({ deadline: null })}>убрать</button>
                )}
              </div>
            </div>

            <div className="field-label">Метки</div>
            <div className="labels-select">
              {board.labels.map(l => (
                <span
                  key={l.id}
                  className={'label label-big' + (card.labels.includes(l.id) ? ' label-active' : '')}
                  style={{ background: l.color }}
                  onClick={() => toggleLabel(l.id)}
                >
                  {card.labels.includes(l.id) ? '✓ ' : ''}{l.name}
                </span>
              ))}
              {board.labels.length === 0 && <span className="muted small">Метки можно добавить в меню доски</span>}
            </div>

            <h4>Описание</h4>
            {editDesc ? (
              <div>
                <textarea
                  autoFocus
                  rows={5}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
                <div className="row">
                  <button className="btn btn-primary" onClick={saveDescription}>Сохранить</button>
                  <button className="btn" onClick={() => { setEditDesc(false); setDescription(card.description || '') }}>Отмена</button>
                </div>
              </div>
            ) : (
              <div className="description" onClick={() => setEditDesc(true)}>
                {card.description ? card.description : <span className="muted">Добавьте подробное описание...</span>}
              </div>
            )}

            <h4>Чек-лист {card.checklist.length > 0 && <span className="muted small">{doneCount}/{card.checklist.length}</span>}</h4>
            {card.checklist.length > 0 && (
              <div className="progress">
                <div className="progress-bar" style={{ width: percent + '%' }} />
              </div>
            )}
            <div className="checklist">
              {card.checklist.map(item => (
                <div key={item.id} className="check-item">
                  <label className={item.done ? 'checked' : ''}>
                    <input type="checkbox" checked={!!item.done} onChange={() => toggleCheckItem(item)} />
                    {item.text}
                  </label>
                  <button className="btn-icon" onClick={() => deleteCheckItem(item)}>✕</button>
                </div>
              ))}
            </div>
            <form className="row" onSubmit={addCheckItem}>
              <input placeholder="Новый пункт" value={checkText} onChange={e => setCheckText(e.target.value)} />
              <button className="btn" type="submit">Добавить</button>
            </form>

            <h4>Вложения</h4>
            <div className="attachments">
              {card.attachments.map(f => (
                <div key={f.id} className="attachment">
                  <a className="attachment-preview" href={fileUrl(f)} target="_blank" rel="noreferrer">
                    {f.mimetype && f.mimetype.startsWith('image/')
                      ? <img src={fileUrl(f)} alt={f.original_name} />
                      : <span>{f.original_name.split('.').pop().toUpperCase()}</span>}
                  </a>
                  <div className="attachment-info">
                    <a href={fileUrl(f)} target="_blank" rel="noreferrer"><b>{f.original_name}</b></a>
                    <div className="muted small">
                      {formatSize(f.size)} · {f.user_name} · {formatDate(f.created_at)}
                    </div>
                    <div>
                      <a className="btn-link" href={fileUrl(f, true)}>скачать</a>
                      <button className="btn-link" onClick={() => deleteFile(f)}>удалить</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <label className="btn upload-btn">
              {uploading ? 'Загрузка...' : 'Прикрепить файл'}
              <input type="file" onChange={handleFile} disabled={uploading} hidden />
            </label>

            <h4>Комментарии</h4>
            <form onSubmit={addComment}>
              <textarea
                rows={2}
                placeholder="Напишите комментарий..."
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={!comment.trim()}>Отправить</button>
            </form>
            <div className="comments">
              {card.comments.slice().reverse().map(c => (
                <div key={c.id} className="comment">
                  <span className="avatar avatar-small">{c.user_name[0].toUpperCase()}</span>
                  <div className="comment-body">
                    <div>
                      <b>{c.user_name}</b> <span className="muted small">{formatDate(c.created_at)}</span>
                      {c.user_id === user.id && (
                        <button className="btn-link" onClick={() => deleteComment(c.id)}>удалить</button>
                      )}
                    </div>
                    <div className="comment-text">{c.text}</div>
                  </div>
                </div>
              ))}
              {card.comments.length === 0 && <div className="muted small">Комментариев пока нет</div>}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-danger" onClick={deleteCard}>Удалить карточку</button>
        </div>
      </div>
    </div>
  )
}

export default CardModal
