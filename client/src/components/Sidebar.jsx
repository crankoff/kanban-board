import { useEffect, useState } from 'react'
import { api, formatDate } from '../api'

const colors = ['#61bd4f', '#f2d600', '#ff9f1a', '#eb5a46', '#c377e0', '#0079bf', '#00c2e0', '#344563']

function Sidebar({ board, user, isOwner, reloadKey, onChanged, onClose }) {
  const [tab, setTab] = useState('members')
  const [email, setEmail] = useState('')
  const [labelName, setLabelName] = useState('')
  const [labelColor, setLabelColor] = useState(colors[0])
  const [activity, setActivity] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (tab === 'history') loadActivity()
  }, [tab, reloadKey])

  async function loadActivity() {
    const data = await api(`/boards/${board.id}/activity`)
    setActivity(data)
  }

  async function addMember(e) {
    e.preventDefault()
    setError('')
    try {
      await api(`/boards/${board.id}/members`, 'POST', { email })
      setEmail('')
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeMember(m) {
    if (!window.confirm(`Удалить ${m.name} с доски?`)) return
    await api(`/boards/${board.id}/members/${m.id}`, 'DELETE')
    onChanged()
  }

  async function addLabel(e) {
    e.preventDefault()
    if (!labelName.trim()) return
    await api(`/boards/${board.id}/labels`, 'POST', { name: labelName, color: labelColor })
    setLabelName('')
    onChanged()
  }

  async function deleteLabel(l) {
    if (!window.confirm(`Удалить метку "${l.name}"?`)) return
    await api('/labels/' + l.id, 'DELETE')
    onChanged()
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <b>Меню</b>
        <button className="btn-icon" onClick={onClose}>✕</button>
      </div>

      <div className="tabs">
        <span className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>Участники</span>
        <span className={tab === 'labels' ? 'active' : ''} onClick={() => setTab('labels')}>Метки</span>
        <span className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>История</span>
      </div>

      {tab === 'members' && (
        <div>
          {board.members.map(m => (
            <div key={m.id} className="member">
              <span className="avatar">{m.name[0].toUpperCase()}</span>
              <div className="member-info">
                <div>{m.name} {m.id === user.id && <span className="muted">(вы)</span>}</div>
                <div className="muted small">{m.email}{m.role === 'owner' && ' · владелец'}</div>
              </div>
              {isOwner && m.role !== 'owner' && (
                <button className="btn-icon" title="Удалить" onClick={() => removeMember(m)}>✕</button>
              )}
            </div>
          ))}

          {isOwner && (
            <form onSubmit={addMember} className="sidebar-form">
              <div className="field-label">Пригласить участника</div>
              {error && <div className="error">{error}</div>}
              <input type="email" placeholder="Email пользователя" value={email} onChange={e => setEmail(e.target.value)} required />
              <button className="btn btn-primary" type="submit">Добавить</button>
            </form>
          )}
        </div>
      )}

      {tab === 'labels' && (
        <div>
          {board.labels.map(l => (
            <div key={l.id} className="label-row">
              <span className="label label-big" style={{ background: l.color }}>{l.name}</span>
              <button className="btn-icon" onClick={() => deleteLabel(l)}>✕</button>
            </div>
          ))}
          <form onSubmit={addLabel} className="sidebar-form">
            <div className="field-label">Новая метка</div>
            <input placeholder="Название" value={labelName} onChange={e => setLabelName(e.target.value)} />
            <div className="colors">
              {colors.map(c => (
                <span
                  key={c}
                  className={'color' + (c === labelColor ? ' color-active' : '')}
                  style={{ background: c }}
                  onClick={() => setLabelColor(c)}
                />
              ))}
            </div>
            <button className="btn btn-primary" type="submit">Создать</button>
          </form>
        </div>
      )}

      {tab === 'history' && (
        <div className="activity">
          {activity.map(a => (
            <div key={a.id} className="activity-item">
              <b>{a.user_name || 'Удаленный пользователь'}</b> {a.text}
              <div className="muted small">{formatDate(a.created_at)}</div>
            </div>
          ))}
          {activity.length === 0 && <div className="muted">Пока пусто</div>}
        </div>
      )}
    </div>
  )
}

export default Sidebar
