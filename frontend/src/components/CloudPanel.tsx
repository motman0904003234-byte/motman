import { useEffect, useState } from 'react'
import {
  cloudStatus,
  createBackup,
  ensureDevice,
  exportCloud,
  restoreBackup,
} from '../api'
import { appStorage } from '../storage'

export function CloudPanel() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [backupId, setBackupId] = useState('')
  const [exportPreview, setExportPreview] = useState('')

  useEffect(() => {
    void (async () => {
      const d = await ensureDevice()
      setDeviceId(d.device_id)
      setStatus(await cloudStatus())
    })().catch((e) => setMsg(String(e)))
  }, [])

  async function onBackup() {
    const res = await createBackup('نسخة من الهاتف')
    setBackupId(res.backup_id)
    setMsg(`تم الحفظ السحابي: ${res.backup_id} — تجار: ${res.n_traders}`)
    await appStorage.set('last_backup_id', res.backup_id)
  }

  async function onRestore() {
    const id = backupId || (await appStorage.get('last_backup_id')) || ''
    if (!id) {
      setMsg('أدخل معرف النسخة')
      return
    }
    const res = await restoreBackup(id)
    setMsg(`تمت الاستعادة: ${res.restored_traders} تاجر`)
  }

  async function onExport() {
    const data = await exportCloud()
    const text = JSON.stringify(data, null, 2)
    setExportPreview(text.slice(0, 1200))
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `motman-backup-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMsg('تم تنزيل نسخة JSON احتياطية')
  }

  return (
    <section className="panel grid">
      <h2 style={{ margin: 0 }}>السحابة والجهاز</h2>
      <p className="tag">
        بيانات التجار والأسعار تُحفظ على خادم مطمن. سجّل نسخة احتياطية يوميًا حتى لا تفقد
        شبكة التجار.
      </p>
      <div className="metrics">
        <div className="metric">
          <div className="k">معرف الجهاز</div>
          <div className="v" style={{ fontSize: '0.85rem' }}>
            {deviceId || '—'}
          </div>
        </div>
        <div className="metric">
          <div className="k">حالة السحابة</div>
          <div className="v">{String(status?.cloud || '…')}</div>
        </div>
        <div className="metric">
          <div className="k">عدد التجار</div>
          <div className="v">{String(status?.n_traders ?? '—')}</div>
        </div>
        <div className="metric">
          <div className="k">التخزين</div>
          <div className="v">{String(status?.storage || '—')}</div>
        </div>
      </div>
      <button className="primary" type="button" onClick={() => void onBackup()}>
        نسخ احتياطي سحابي الآن
      </button>
      <label>
        استعادة من معرف نسخة
        <input value={backupId} onChange={(e) => setBackupId(e.target.value)} placeholder="bk_..." />
      </label>
      <button type="button" onClick={() => void onRestore()}>
        استعادة
      </button>
      <button type="button" onClick={() => void onExport()}>
        تنزيل JSON للجهاز/Drive
      </button>
      {msg && <p className="tag">{msg}</p>}
      {exportPreview && (
        <pre className="mono" style={{ whiteSpace: 'pre-wrap', color: '#a7bbae', margin: 0 }}>
          {exportPreview}
        </pre>
      )}
    </section>
  )
}