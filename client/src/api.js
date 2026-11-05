// обертка над fetch чтобы не писать каждый раз заголовки и токен
export async function api(url, method = 'GET', body) {
  const token = localStorage.getItem('token')
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = 'Bearer ' + token

  const res = await fetch('/api' + url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })

  let data = {}
  try {
    data = await res.json()
  } catch (e) {
    // ответ без тела
  }

  if (res.status === 401 && token) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  }

  if (!res.ok) {
    throw new Error(data.error || 'Ошибка запроса')
  }
  return data
}

// для файлов отдельная функция, тут нельзя ставить Content-Type json
export async function uploadFile(url, file) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch('/api' + url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') },
    body: formData
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
  return data
}

export function fileUrl(file, download) {
  const token = localStorage.getItem('token')
  let url = `/api/attachments/${file.id}/${encodeURIComponent(file.original_name)}?token=${token}`
  if (download) url += '&download=1'
  return url
}

export function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' Б'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ'
  return (bytes / 1024 / 1024).toFixed(1) + ' МБ'
}

export function formatDate(str) {
  if (!str) return ''
  // sqlite хранит время в UTC без указания зоны
  const d = new Date(str.replace(' ', 'T') + 'Z')
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// статус дедлайна для подсветки
export function deadlineStatus(deadline) {
  if (!deadline) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(deadline + 'T00:00:00')
  const diff = (d - today) / (1000 * 60 * 60 * 24)
  if (diff < 0) return 'overdue'
  if (diff <= 1) return 'soon'
  return ''
}

export function formatDeadline(deadline) {
  if (!deadline) return ''
  const [y, m, d] = deadline.split('-')
  return `${d}.${m}.${y}`
}
