import { useEffect, useState } from 'react'
import { appStorage } from '../storage'
import { cloudStatus, createBackup, ensureDevice } from '../api'

const API_KEY = 'motman_api_base'

export async function getApiBase(): Promise<string> {
  const saved = await appStorage.get(API_KEY)
  if (saved) return saved.replace(/\/$/, '')
  return (import.meta.env.VITE_API_BASE || '/api/v1').replace(/\/$/, '')
}

export async function setApiBase(url: string): Promise<void> {
  const clean = url.trim().replace(/\/$/, '')
  await appStorage.set(API_KEY, clean)
}

export function SettingsPanel() {
  const [apiBase, setApi] = useState('/api/v1')
  const [online, setOnline] = useState(navigator.onLine)
  const [cloud, setCloud] = useState<string>('…')
  const [deviceId, setDeviceId] = useState<string>('…')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    void (async () => {
      setApi(await getApiBase())
      try {
        const d = await ensureDevice()
        setDeviceId(d.device_id)
        const st = await cloudStatus()
        setCloud(String(st.cloud))
      } catch {
        setCloud('offline')
      }
    })()
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  async function save() {
    await setApiBase(apiBase)
    setMsg('تم حفظ عنوان الخادم. أعد تحميل الصفحة.')
  }

  async function backupNow() {
    try {
      const res = await createBackup('نسخة تلقائية من الإعدادات')
      setMsg(`نسخ احتياطي: ${res.backup_id}`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'فشل النسخ')
    }
  }

  return (
    <section className="panel grid">
      <h2 style={{ margin: 0 }}>الإعدادات والاتصال</h2>
      <div className="metrics">
        <div className="metric">
          <div className="k">الإنترنت</div>
          <div className="v">{online ? 'متصل' : 'غير متصل'}</div>
        </div>
        <div className="metric">
          <div className="k">السحابة</div>
          <div className="v">{cloud}</div>
        </div>
        <div className="metric">
          <div className="k">الجهاز</div>
          <div className="v" style={{ fontSize: '0.75rem' }}>
            {deviceId}
          </div>
        </div>
      </div>
      <label>
        عنوان API السحابي
        <input
          value={apiBase}
          onChange={(e) => setApi(e.target.value)}
          placeholder="https://your-server.com/api/v1"
        />
      </label>
      <p className="tag">
        للهاتف عبر الإنترنت ضع رابط الخادم العام + `/api/v1`. مثال النفق الحالي قد يتغير؛ للإنتاج استخدم
        نطاق ثابت.
      </p>
      <button className="primary" type="button" onClick={() => void save()}>
        حفظ عنوان الخادم
      </button>
      <button type="button" onClick={() => void backupNow()}>
        نسخ احتياطي الآن
      </button>
      {msg && <p className="tag">{msg}</p>}
    </section>
  )
}