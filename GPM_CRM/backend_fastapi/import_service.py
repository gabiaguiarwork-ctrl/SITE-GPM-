import pandas as pd
import sqlite3
import json
from .db import get_conn
import re


def parse_value(v):
    if v is None:
        return None
    s = str(v).strip()
    if s == '':
        return None
    # remove currency symbols and dots; replace comma with dot
    s2 = re.sub(r'[^0-9,.-]', '', s)
    s2 = s2.replace('.', '').replace(',', '.') if s2.count(',') <= 1 else s2.replace('.', '')
    try:
        return float(s2)
    except Exception:
        try:
            return float(s)
        except Exception:
            return None


CANONICAL = {
    'Data da Criação': 'created_at',
    'Nome': 'opportunity_name',
    'Empresa': 'client',
    'Funil de vendas': 'funnel',
    'Etapa': 'stage',
    'Valor': 'value',
    'Temperatura': 'temperature',
    'Fonte': 'source',
    'Responsável': 'owner',
    'Produtos': 'products',
    'Licitações': 'licitations',
    'Lote da Licitações': 'bid_lot',
    'Contatos': 'contact_name',
    'Cargo': 'contact_role',
    'Email': 'email',
    'Telefone': 'phone'
}


def normalize_row(row):
    out = {}
    for k, v in row.items():
        if k in CANONICAL:
            out[CANONICAL[k]] = v
        else:
            # try some common variants
            lk = k.lower().strip()
            if 'nome' in lk and 'oportunidade' in lk:
                out['opportunity_name'] = v
            elif 'empresa' in lk or 'cliente' in lk:
                out['client'] = v
            elif 'valor' in lk:
                out['value'] = v
            else:
                out.setdefault('extra', {})[k] = v
    return out


def import_dataframe(df, filename=None, uploaded_by=None):
    conn = get_conn()
    cur = conn.cursor()

    rows_total = 0
    rows_inserted = 0
    rows_updated = 0

    for _, r in df.iterrows():
        rows_total += 1
        row = r.to_dict()
        norm = normalize_row(row)

        created_at = norm.get('created_at')
        opportunity_name = (norm.get('opportunity_name') or '').strip()
        client = (norm.get('client') or '').strip()
        funnel = norm.get('funnel')
        stage = norm.get('stage')
        value = parse_value(norm.get('value'))
        temperature = norm.get('temperature')
        source = norm.get('source')
        owner = norm.get('owner')
        products = norm.get('products')
        licitations = norm.get('licitations')
        bid_lot = norm.get('bid_lot')
        contact_name = norm.get('contact_name')
        contact_role = norm.get('contact_role')
        email = norm.get('email')
        phone = norm.get('phone')

        raw = json.dumps(row, default=str, ensure_ascii=False)

        # dedupe by opportunity_name + client + bid_lot
        cur.execute('SELECT id FROM leads WHERE lower(opportunity_name)=? AND lower(client)=? AND bid_lot=?',
                    (opportunity_name.lower(), client.lower(), bid_lot))
        found = cur.fetchone()
        if found:
            lead_id = found['id']
            cur.execute('''UPDATE leads SET created_at=?, funnel=?, stage=?, value=?, temperature=?, source=?, owner=?, products=?, licitations=?, bid_lot=?, contact_name=?, contact_role=?, email=?, phone=?, raw_data=?, updated_at=datetime('now') WHERE id=?''',
                        (created_at, funnel, stage, value, temperature, source, owner, products, licitations, bid_lot, contact_name, contact_role, email, phone, raw, lead_id))
            rows_updated += 1
        else:
            cur.execute('''INSERT INTO leads (created_at, opportunity_name, client, funnel, stage, value, temperature, source, owner, products, licitations, bid_lot, contact_name, contact_role, email, phone, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                        (created_at, opportunity_name, client, funnel, stage, value, temperature, source, owner, products, licitations, bid_lot, contact_name, contact_role, email, phone, raw))
            rows_inserted += 1

    # write import record
    cur.execute('INSERT INTO imports (filename, uploaded_by, rows_total, rows_inserted, rows_updated, summary) VALUES (?, ?, ?, ?, ?, ?)',
                (filename, uploaded_by, rows_total, rows_inserted, rows_updated, json.dumps({'rows_total': rows_total, 'inserted': rows_inserted, 'updated': rows_updated}, ensure_ascii=False)))

    conn.commit()
    conn.close()

    return {'rows_total': rows_total, 'rows_inserted': rows_inserted, 'rows_updated': rows_updated}


def import_fileobj(fileobj, filename=None, uploaded_by=None):
    # read into pandas
    df = pd.read_excel(fileobj, engine='openpyxl')
    return import_dataframe(df, filename=filename, uploaded_by=uploaded_by)
