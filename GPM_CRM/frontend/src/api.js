const API_BASE = import.meta.env.VITE_API_BASE || ''

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value)
    }
  })
  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

export async function fetchKpis(params = {}) {
  const query = buildQuery(params)
  const res = await fetch(`${API_BASE}/api/kpis${query}`)
  if (!res.ok) {
    throw new Error('Falha ao carregar KPIs')
  }
  return res.json()
}

export async function fetchLeads(params = {}) {
  const query = buildQuery(params)
  const res = await fetch(`${API_BASE}/api/leads${query}`)
  if (!res.ok) {
    throw new Error('Falha ao carregar leads')
  }
  return res.json()
}

export async function fetchLead(id) {
  const res = await fetch(`${API_BASE}/api/leads/${id}`)
  if (!res.ok) {
    throw new Error('Falha ao carregar lead')
  }
  return res.json()
}

export async function updateLead(id, payload) {
  const res = await fetch(`${API_BASE}/api/leads/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    throw new Error('Falha ao atualizar lead')
  }
  return res.json()
}
