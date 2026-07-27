import { useEffect, useState } from 'react'
import { QuotePanel } from './components/QuotePanel'
import { TraderDesk } from './components/TraderDesk'
import { HistoryPanel } from './components/HistoryPanel'
import { TradersPanel } from './components/TradersPanel'
import { CloudPanel } from './components/CloudPanel'
import { ensureDevice, refreshSources } from './api'

type Tab = 'quote' | 'traders' | 'trader' | 'cloud' | 'history'

export default function App() {
  const [tab, setTab] = useState<Tab>('traders')
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)
  const [installHint, setInstallHint] = useState(true)

  useEffect(() => {
    void ensureDevice('هاتف مطمن').catch(() => undefined)
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
          ابدأ اليوم: ابحث عن التجار، احسب السعر الشفاف، واحفظ كل شيء سحابيًا. لا حفظ أموال ولا
          تنفيذ تلقائي.
        </p>
        {installHint && (
          <p className="tag" style={{ border: '1px solid var(--line)', padding: '0.7rem', borderRadius: 12 }}>
            لتثبيته كتطبيق: من متصفح الهاتف اختر «إضافة إلى الشاشة الرئيسية».{' '}
            <button type="button" onClick={() => setInstallHint(false)}>
              حسناً
            </button>
          </p>
        )}
        <div className="nav">
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
          <button onClick={() => void onRefresh()}>تحديث</button>
        </div>
        {refreshMsg && <p className="tag">{refreshMsg}</p>}
      </header>

      {tab === 'traders' && <TradersPanel />}
      {tab === 'quote' && <QuotePanel />}
      {tab === 'trader' && <TraderDesk />}
      {tab === 'cloud' && <CloudPanel />}
      {tab === 'history' && <HistoryPanel />}

      <footer className="footer">
        التخزين السحابي يحفظ التجار والتواصل والنسخ الاحتياطية. الدفع لا يؤثر على وزن المؤشر.
      </footer>
    </div>
  )
}