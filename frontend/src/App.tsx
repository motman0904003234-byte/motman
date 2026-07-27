import { useEffect, useState } from 'react'
import { QuotePanel } from './components/QuotePanel'
import { TraderDesk } from './components/TraderDesk'
import { HistoryPanel } from './components/HistoryPanel'
import { TradersPanel } from './components/TradersPanel'
import { CloudPanel } from './components/CloudPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { FieldworkPanel } from './components/FieldworkPanel'
import { ensureDevice, refreshSources } from './api'

type Tab = 'today' | 'quote' | 'traders' | 'trader' | 'cloud' | 'history' | 'settings'

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)
  const [installHint, setInstallHint] = useState(true)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    void ensureDevice('هاتف مطمن').catch(() => undefined)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  async function onRefresh() {
    try {
      const res = await refreshSources()
      setRefreshMsg(`تم التحديث: ${(res.sources || []).length} مصدر`)
    } catch (e) {
      setRefreshMsg(e instanceof Error ? e.message : 'فشل التحديث')
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="brand">
          <h1>
            <span>مطمن</span> للجوال
          </h1>
        </div>
        <p className="tag">
          ابدأ اليوم: ثبّت التطبيق، أضف التجار، أرسل رسائل جاهزة، واحفظ كل شيء سحابيًا. لا حفظ أموال
          ولا تنفيذ تلقائي.
        </p>
        <p className="tag">
          الحالة: {online ? 'متصل بالإنترنت' : 'بدون إنترنت — عرض النسخة المحلية للتجار إن وُجدت'}
        </p>
        {installHint && (
          <p className="tag" style={{ border: '1px solid var(--line)', padding: '0.7rem', borderRadius: 12 }}>
            ثبّته الآن: من تبويب «اليوم» حمّل APK أو امسحه بـQR، أو من المتصفح «إضافة إلى الشاشة
            الرئيسية».{' '}
            <button type="button" onClick={() => setInstallHint(false)}>
              حسناً
            </button>
          </p>
        )}
        <div className="nav">
          <button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}>
            اليوم
          </button>
          <button className={tab === 'traders' ? 'active' : ''} onClick={() => setTab('traders')}>
            التجار
          </button>
          <button className={tab === 'quote' ? 'active' : ''} onClick={() => setTab('quote')}>
            التسعير
          </button>
          <button className={tab === 'trader' ? 'active' : ''} onClick={() => setTab('trader')}>
            RFQ
          </button>
          <button className={tab === 'cloud' ? 'active' : ''} onClick={() => setTab('cloud')}>
            السحابة
          </button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            التاريخ
          </button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
            إعدادات
          </button>
          <button onClick={() => void onRefresh()}>تحديث</button>
        </div>
        {refreshMsg && <p className="tag">{refreshMsg}</p>}
      </header>

      {tab === 'today' && <FieldworkPanel />}
      {tab === 'traders' && <TradersPanel />}
      {tab === 'quote' && <QuotePanel />}
      {tab === 'trader' && <TraderDesk />}
      {tab === 'cloud' && <CloudPanel />}
      {tab === 'history' && <HistoryPanel />}
      {tab === 'settings' && <SettingsPanel />}

      <footer className="footer">
        التخزين السحابي يحفظ التجار والتواصل والنسخ الاحتياطية. الدفع لا يؤثر على وزن المؤشر.
      </footer>
    </div>
  )
}