import { useState, useEffect } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts'
import { fetchKpis, fetchLeads, fetchLead, updateLead } from './api'

const COLORS = ['#0f172a', '#334155', '#475569', '#64748b', '#7c3aed', '#22c55e', '#f97316']
const UNITS = ['MDO E TECNOLOGIA', 'MOVIMENTAÇÃO DE CARGA', 'TECNOLOGIA EM OP. INDUSTRIAIS', 'TROPHEUS']
const STAGES = ['LEAD GERADO', 'QUALIFICADO', 'ANÁLISE TÉCNICA', 'PESQUISA DE PREÇOS', 'PROPOSTA ENVIADA', 'NEGOCIAÇÃO', 'KICK-OFF INTERNO']
const TABS = [
  { key: 'dashboard', label: 'Dashboard Geral' },
  { key: 'pipeline', label: 'Funil por Unidade' }
]

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [kpis, setKpis] = useState(null)
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ funnel: '', stage: '', temperature: '', owner: '', q: '' })
  const [options, setOptions] = useState({ funnels: [], stages: [], temperatures: [], owners: [] })

  const [selectedUnit, setSelectedUnit] = useState(UNITS[0])
  const [unitKpis, setUnitKpis] = useState(null)
  const [boardLeads, setBoardLeads] = useState([])
  const [selectedLead, setSelectedLead] = useState(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    loadDashboard()
  }, [])

  useEffect(() => {
    if (activeTab === 'pipeline') {
      loadUnitFunnel(selectedUnit)
    }
  }, [activeTab, selectedUnit])

  async function loadDashboard() {
    setLoading(true)
    try {
      const [summary, recentLeads] = await Promise.all([
        fetchKpis(),
        fetchLeads({ limit: 10 })
      ])
      setKpis(summary)
      setLeads(recentLeads)
      buildOptions(recentLeads)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function loadUnitFunnel(unit) {
    setLoading(true)
    try {
      const [summary, unitLeads] = await Promise.all([
        fetchKpis({ unit }),
        fetchLeads({ funnel: unit, limit: 500 })
      ])
      setUnitKpis(summary)
      setBoardLeads(unitLeads)
      setSelectedLead(null)
      setDetailsOpen(false)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function applyFilters() {
    setLoading(true)
    try {
      const filtered = await fetchLeads({
        limit: 50,
        funnel: filters.funnel,
        stage: filters.stage,
        temperature: filters.temperature,
        owner: filters.owner,
        q: filters.q
      })
      setLeads(filtered)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  function buildOptions(leadsData) {
    const funnels = Array.from(new Set(leadsData.map(item => item.funnel || '').filter(Boolean))).sort()
    const stages = Array.from(new Set(leadsData.map(item => item.stage || '').filter(Boolean))).sort()
    const temperatures = Array.from(new Set(leadsData.map(item => item.temperature || '').filter(Boolean))).sort()
    const owners = Array.from(new Set(leadsData.map(item => item.owner || '').filter(Boolean))).sort()
    setOptions({ funnels, stages, temperatures, owners })
  }

  function updateFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  function groupedLeads() {
    return STAGES.reduce((acc, stage) => {
      acc[stage] = boardLeads.filter(lead => (lead.stage || '').toUpperCase() === stage)
      return acc
    }, {})
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  async function handleDrop(targetStage, event) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain')
    if (!id) return
    const leadId = Number(id)
    const lead = boardLeads.find(item => item.id === leadId)
    if (!lead || lead.stage === targetStage) return

    try {
      setLoading(true)
      const updated = await updateLead(leadId, { stage: targetStage })
      setBoardLeads(prev => prev.map(item => (item.id === leadId ? updated : item)))
      if (selectedLead?.id === leadId) {
        setSelectedLead(updated)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function openLeadDetails(id) {
    try {
      const detail = await fetchLead(id)
      setSelectedLead(detail)
      setDetailsOpen(true)
    } catch (error) {
      console.error(error)
    }
  }

  function closeDetails() {
    setDetailsOpen(false)
  }

  const board = groupedLeads()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-8">
          <p className="text-sm text-slate-500">GPM CRM</p>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard Comercial</h1>
          <p className="mt-2 text-slate-600">Leads, pipeline e funil por unidade com persistência em SQLite.</p>
        </header>

        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-3">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeTab === tab.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="text-sm text-slate-500">Aba ativa: {activeTab === 'dashboard' ? 'Dashboard Geral' : 'Funil por Unidade'}</div>
        </div>

        {activeTab === 'dashboard' ? (
          <>
            <section className="grid gap-4 lg:grid-cols-4">
              <Card label="Pipeline total" value={kpis ? kpis.pipeline_total : null} type="money" />
              <Card label="Negócios quentes" value={kpis ? (kpis.deals_quentes?.total || 0) : null} type="money" />
              <Card label="Negócios mornos" value={kpis ? (kpis.deals_mornos?.total || 0) : null} type="money" />
              <Card label="Negócios frios" value={kpis ? (kpis.deals_frios?.total || 0) : null} type="money" />
            </section>

            <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-6 lg:grid-cols-3">
                <ChartCard title="Pipeline por unidade" height={240}>
                  {kpis?.by_unit?.length ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={kpis.by_unit} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <XAxis dataKey="unit" tickLine={false} axisLine={false} />
                        <YAxis tickFormatter={value => `R$ ${value / 1000}k`} />
                        <Tooltip formatter={value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)} />
                        <Bar dataKey="total" fill="#0f172a" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-slate-500">Sem dados</p>
                  )}
                </ChartCard>
                <ChartCard title="Pipeline por etapa" height={240}>
                  {kpis?.by_stage?.length ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={kpis.by_stage} dataKey="qty" nameKey="stage" innerRadius={50} outerRadius={90} paddingAngle={3}>
                          {kpis.by_stage.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Legend verticalAlign="bottom" height={36} />
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-slate-500">Sem dados</p>
                  )}
                </ChartCard>
                <ChartCard title="Top 5 oportunidades" height={240}>
                  <div className="space-y-3">
                    {kpis?.top_opportunities?.slice(0, 5).map(item => (
                      <div key={item.id} className="rounded-2xl bg-slate-50 p-3">
                        <p className="font-semibold text-slate-800">{item.opportunity_name}</p>
                        <p className="text-sm text-slate-500">{item.client} • {item.stage}</p>
                        <p className="mt-1 text-sm text-slate-700">{formatMoney(item.value)}</p>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              </div>
            </section>

            <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Leads filtráveis</h2>
                  <p className="text-sm text-slate-500">Aplique filtros por unidade, etapa, temperatura e responsável.</p>
                </div>
                <button
                  onClick={applyFilters}
                  disabled={loading}
                  className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                  {loading ? 'Filtrando...' : 'Aplicar filtros'}
                </button>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-5">
                <FilterSelect label="Unidade" value={filters.funnel} onChange={value => updateFilter('funnel', value)} options={options.funnels} />
                <FilterSelect label="Etapa" value={filters.stage} onChange={value => updateFilter('stage', value)} options={options.stages} />
                <FilterSelect label="Temperatura" value={filters.temperature} onChange={value => updateFilter('temperature', value)} options={options.temperatures} />
                <FilterSelect label="Responsável" value={filters.owner} onChange={value => updateFilter('owner', value)} options={options.owners} />
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Busca</label>
                  <input
                    value={filters.q}
                    onChange={event => updateFilter('q', event.target.value)}
                    placeholder="Cliente, projeto ou contato"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Criação</th>
                      <th className="px-4 py-3 text-left font-medium">Cliente</th>
                      <th className="px-4 py-3 text-left font-medium">Projeto</th>
                      <th className="px-4 py-3 text-left font-medium">Valor</th>
                      <th className="px-4 py-3 text-left font-medium">Temperatura</th>
                      <th className="px-4 py-3 text-left font-medium">Responsável</th>
                      <th className="px-4 py-3 text-left font-medium">Etapa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {leads.length ? leads.map(lead => (
                      <tr key={lead.id} className="bg-white hover:bg-slate-50">
                        <td className="px-4 py-4 text-slate-600">{lead.created_at?.split(' ')[0] || '-'}</td>
                        <td className="px-4 py-4 font-medium text-slate-900">{lead.client || '-'}</td>
                        <td className="px-4 py-4 text-slate-700">{lead.opportunity_name || '-'}</td>
                        <td className="px-4 py-4 text-slate-700">{formatMoney(lead.value)}</td>
                        <td className="px-4 py-4 text-slate-700">{lead.temperature || '-'}</td>
                        <td className="px-4 py-4 text-slate-700">{lead.owner || '-'}</td>
                        <td className="px-4 py-4 text-slate-700">{lead.stage || '-'}</td>
                      </tr>
                    )) : (
                      <tr className="bg-white">
                        <td className="px-4 py-4 text-slate-500" colSpan={7}>Sem leads encontrados para os filtros aplicados.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm text-slate-500">Unidade selecionada</p>
                  <h2 className="text-2xl font-semibold text-slate-900">{selectedUnit}</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  {UNITS.map(unit => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setSelectedUnit(unit)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${selectedUnit === unit ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <Card label="Pipeline total da unidade" value={unitKpis ? unitKpis.pipeline_total : null} type="money" />
                <Card label="Deals quentes" value={unitKpis ? unitKpis.deals_quentes : null} />
                <Card label="Deals mornos" value={unitKpis ? unitKpis.deals_mornos : null} />
                <Card label="Deals frios" value={unitKpis ? unitKpis.deals_frios : null} />
              </div>

              <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm text-slate-500">Maior oportunidade em andamento</p>
                {unitKpis?.largest_opportunity ? (
                  <div className="mt-4 rounded-3xl bg-white p-5 shadow-sm">
                    <p className="text-lg font-semibold text-slate-900">{unitKpis.largest_opportunity.opportunity_name}</p>
                    <p className="mt-1 text-sm text-slate-500">{unitKpis.largest_opportunity.client}</p>
                    <p className="mt-3 text-xl font-semibold text-slate-900">{formatMoney(unitKpis.largest_opportunity.value)}</p>
                    <p className="mt-1 text-sm text-slate-600">Etapa: {unitKpis.largest_opportunity.stage || '-'}</p>
                    <p className="text-sm text-slate-600">Temperatura: {unitKpis.largest_opportunity.temperature || '-'}</p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">Nenhuma oportunidade encontrada para esta unidade.</p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Kanban de etapas</h2>
                  <p className="text-sm text-slate-500">Arraste as negociações entre as fases para atualizar o estágio.</p>
                </div>
                <div className="text-sm text-slate-500">{boardLeads.length} negociações</div>
              </div>
              <div className="grid gap-4 overflow-x-auto lg:grid-cols-3 xl:grid-cols-4">
                {STAGES.map(stage => (
                  <div
                    key={stage}
                    className="min-h-[320px] rounded-3xl border border-slate-200 bg-slate-50 p-4"
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => handleDrop(stage, event)}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{stage}</h3>
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-semibold uppercase text-slate-600">{board[stage]?.length || 0}</span>
                    </div>
                    <div className="space-y-3">
                      {board[stage]?.map(lead => (
                        <button
                          key={lead.id}
                          type="button"
                          draggable
                          onDragStart={event => event.dataTransfer.setData('text/plain', String(lead.id))}
                          onClick={() => openLeadDetails(lead.id)}
                          className="w-full rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
                        >
                          <p className="font-semibold text-slate-900">{lead.opportunity_name || 'Sem nome'}</p>
                          <p className="mt-1 text-sm text-slate-500">{lead.client || 'Sem empresa'}</p>
                          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                            <span>Valor: {formatMoney(lead.value)}</span>
                            <span>Temp.: {lead.temperature || 'N/I'}</span>
                            <span>Resp.: {lead.owner || 'N/I'}</span>
                            <span>Criação: {lead.created_at?.split(' ')[0] || '-'}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      {detailsOpen && selectedLead ? (
        <div className="fixed inset-0 z-40 flex items-stretch bg-slate-900/40">
          <div className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Detalhes da negociação</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">{selectedLead.opportunity_name}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedLead.client}</p>
              </div>
              <button onClick={closeDetails} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">
                Fechar
              </button>
            </div>

            <div className="grid gap-6">
              <DetailLabel label="Valor" value={formatMoney(selectedLead.value)} />
              <DetailLabel label="Etapa" value={selectedLead.stage || '-'} />
              <DetailLabel label="Temperatura" value={selectedLead.temperature || '-'} />
              <DetailLabel label="Fonte" value={selectedLead.source || '-'} />
              <DetailLabel label="Produtos" value={selectedLead.products || '-'} />
              <DetailLabel label="Licitações" value={selectedLead.licitations || '-'} />
              <DetailLabel label="Contatos" value={selectedLead.contact_name || '-'} />
              <DetailLabel label="Cargo" value={selectedLead.contact_role || '-'} />
              <DetailLabel label="Email" value={selectedLead.email || '-'} />
              <DetailLabel label="Telefone" value={selectedLead.phone || '-'} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Card({ label, value, type }) {
  const formatted = value === null ? '--' : type === 'money'
    ? Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : value
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{formatted}</p>
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      >
        <option value="">Todos</option>
        {options.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  )
}

function DetailLabel({ label, value }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-slate-900">{value}</p>
    </div>
  )
}

export default App
