import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

function Register({ onLogin }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', password2: '' })
  const [error, setError] = useState('')

  function change(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.password !== form.password2) {
      setError('Пароли не совпадают')
      return
    }
    try {
      const data = await api('/auth/register', 'POST', {
        name: form.name,
        email: form.email,
        password: form.password
      })
      onLogin(data)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h2>Регистрация</h2>
        {error && <div className="error">{error}</div>}
        <input name="name" placeholder="Имя" value={form.name} onChange={change} required />
        <input name="email" type="email" placeholder="Email" value={form.email} onChange={change} required />
        <input name="password" type="password" placeholder="Пароль (мин. 6 символов)" value={form.password} onChange={change} required />
        <input name="password2" type="password" placeholder="Повторите пароль" value={form.password2} onChange={change} required />
        <button className="btn btn-primary" type="submit">Зарегистрироваться</button>
        <p>Уже есть аккаунт? <Link to="/login">Войти</Link></p>
      </form>
    </div>
  )
}

export default Register
