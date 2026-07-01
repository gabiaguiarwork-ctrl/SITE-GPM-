import('./import_xlsx.js').then(mod => {
  const path = 'C:/Users/gabri/GPM/CRM/FUNIL_MDO_corrigido.xlsx'
  mod.importXlsx(path).then(res => {
    console.log('IMPORT_RESULT', JSON.stringify(res))
  }).catch(err => {
    console.error('IMPORT_ERROR', err && err.message)
  })
}).catch(e=>{ console.error('LOAD_ERROR', e && e.message) })
