// src/admin/CreateTenantManual.jsx
import { useState } from 'react'
import { createTenant } from './useCreateTenant'
import { isAdminConfigured } from '../supabaseAdmin'

const PLANS = [
  { value: 'basic',      label: 'Basic',      color: 'text-gray-600' },
  { value: 'pro',        label: 'Pro',         color: 'text-blue-600' },
  { value: 'enterprise', label: 'Enterprise',  color: 'text-purple-600' },
]

const FIELDS = [
  { name: 'businessName', placeholder: 'Business Name', required: true  },
  { name: 'ownerName',    placeholder: 'Owner Name',    required: false },
  { name: 'email',        placeholder: 'Email',         required: true, type: 'email' },
  { name: 'phone',        placeholder: 'Phone',         required: false, type: 'tel'  },
]

const EMPTY_FORM = { businessName: '', ownerName: '', email: '', phone: '', plan: 'basic' }

export default function CreateTenantManual() {
  const [form,   setForm]   = useState(EMPTY_FORM)
  const [status, setStatus] = useState(null)   // null | 'loading' | 'success' | 'error'
  const [error,  setError]  = useState('')
  const [result, setResult] = useState(null)

  const handleChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.businessName.trim() || !form.email.trim()) return
    setStatus('loading')
    setError('')
    try {
      const res = await createTenant(form)
      setResult(res)
      setStatus('success')
      setForm(EMPTY_FORM)
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  // Guard: if service key is missing, show a clear warning instead of a broken form
  if (!isAdminConfigured) {
    return (
      <div className="max-w-md mx-auto p-6 bg-yellow-50 border border-yellow-200 rounded-xl">
        <p className="text-sm text-yellow-800 font-medium">
          ⚠️ <strong>VITE_SUPABASE_SERVICE_KEY</strong> not configured.
          Add it to your <code>.env</code> file and Vercel environment variables, then redeploy.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-xl shadow space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">New Tools4Care Client</h2>
        <p className="text-xs text-gray-400 mt-1">Creates auth user + tenant record + sends magic link</p>
      </div>

      {FIELDS.map(({ name, placeholder, required, type = 'text' }) => (
        <input
          key={name}
          name={name}
          type={type}
          placeholder={placeholder + (required ? ' *' : '')}
          value={form[name]}
          onChange={handleChange}
          disabled={status === 'loading'}
          className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
      ))}

      <select
        name="plan"
        value={form.plan}
        onChange={handleChange}
        disabled={status === 'loading'}
        className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {PLANS.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>

      <button
        onClick={handleSubmit}
        disabled={status === 'loading' || !form.businessName.trim() || !form.email.trim()}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-medium transition"
      >
        {status === 'loading' ? 'Creating...' : 'Create Client'}
      </button>

      {status === 'success' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          ✅ Client created! Magic link sent to <strong>{result.email}</strong>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ❌ {error}
        </div>
      )}
    </div>
  )
}
