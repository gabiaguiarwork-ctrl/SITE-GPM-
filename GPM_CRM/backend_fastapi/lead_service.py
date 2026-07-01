from .db import get_conn


def row_to_dict(row):
    if row is None:
        return None
    return {k: row[k] for k in row.keys()}


def get_leads(limit=50, offset=0, funnel=None, stage=None, temperature=None, owner=None, q=None):
    conn = get_conn()
    cur = conn.cursor()
    query = 'SELECT * FROM leads'
    where = []
    params = []
    if funnel:
        where.append('lower(funnel)=?')
        params.append(funnel.lower())
    if stage:
        where.append('lower(stage)=?')
        params.append(stage.lower())
    if temperature:
        where.append('lower(temperature)=?')
        params.append(temperature.lower())
    if owner:
        where.append('lower(owner)=?')
        params.append(owner.lower())
    if q:
        like = f'%{q.lower()}%'
        where.append('(lower(opportunity_name) LIKE ? OR lower(client) LIKE ? OR lower(contact_name) LIKE ? OR lower(source) LIKE ?)')
        params.extend([like, like, like, like])
    if where:
        query += ' WHERE ' + ' AND '.join(where)
    query += ' ORDER BY created_at_import DESC LIMIT ? OFFSET ?'
    params.extend([limit, offset])
    rows = cur.execute(query, params).fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


def get_lead_by_id(lead_id):
    conn = get_conn()
    cur = conn.cursor()
    row = cur.execute('SELECT * FROM leads WHERE id = ?', (lead_id,)).fetchone()
    conn.close()
    return row_to_dict(row)


def update_lead(lead_id, payload):
    conn = get_conn()
    cur = conn.cursor()
    fields = []
    params = []
    allowed = ['created_at', 'opportunity_name', 'client', 'funnel', 'stage', 'value', 'temperature', 'source', 'owner', 'products', 'licitations', 'bid_lot', 'contact_name', 'contact_role', 'email', 'phone']
    for key in allowed:
        if key in payload:
            fields.append(f'{key} = ?')
            params.append(payload[key])
    if not fields:
        conn.close()
        return get_lead_by_id(lead_id)
    params.append(lead_id)
    query = f'UPDATE leads SET {", ".join(fields)}, updated_at = datetime(\'now\') WHERE id = ?'
    cur.execute(query, params)
    conn.commit()
    conn.close()
    return get_lead_by_id(lead_id)


def get_kpi_summary():
    conn = get_conn()
    cur = conn.cursor()
    total = cur.execute('SELECT COUNT(*) as count, SUM(value) as total FROM leads').fetchone()
    temper = cur.execute('SELECT COALESCE(temperature, \'SIN DADO\') as temperature, COUNT(*) as qty, SUM(value) as total FROM leads GROUP BY temperature').fetchall()
    unit = cur.execute('SELECT COALESCE(funnel, \'SEM UNIDADE\') as unit, COUNT(*) as qty, SUM(value) as total FROM leads GROUP BY funnel').fetchall()
    stage = cur.execute('SELECT COALESCE(stage, \'SEM ETAPA\') as stage, COUNT(*) as qty, SUM(value) as total FROM leads GROUP BY stage').fetchall()
    top = cur.execute('SELECT id, opportunity_name, client, funnel, stage, value, temperature, owner FROM leads ORDER BY value DESC LIMIT 10').fetchall()
    conn.close()
    return {
        'total_deals': total['count'],
        'pipeline_total': total['total'] or 0,
        'by_temperature': [row_to_dict(r) for r in temper],
        'by_unit': [row_to_dict(r) for r in unit],
        'by_stage': [row_to_dict(r) for r in stage],
        'top_opportunities': [row_to_dict(r) for r in top]
    }
