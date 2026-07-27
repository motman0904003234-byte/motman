import { useState } from 'react'
import { QuotePanel } from './components/QuotePanel'
import { TraderDesk } from './components/TraderDesk'
import { HistoryPanel } from './components/HistoryPanel'
import { refreshSources } from './api'

type Tab = 'quote' | 'trader' | 'history'

export default function App() {
  const [tab, setTab] = useState<Tab>('quote')
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

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
            <span>مطمن</span> مؤشر الصرف
          </h1>
        </div>
        <p className="tag">
          أسعار لحظية شفافة لمسارات Bankak-SDG وCash-SDG وMTN-MoMo-RWF وBank-RWF دون دمجها في
          رقم مضلل. مرحلة البيانات والتنبيهات فقط — بلا حفظ أموال وبلا تنفيذ تلقائي.
        </p>
        <div className="nav">
          <button className={tab === 'quote' ? 'active' : ''} onClick={() => setTab('quote')}>
            التسعير
          </button>
          <button className={tab === 'trader' ? 'active' : ''} onClick={() => setTab('trader')}>
            لوحة التاجر
          </button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            التاريخ
          </button>
          <button onClick={() => void onRefresh()}>تحديث المصادر</button>
        </div>
        {refreshMsg && <p className="tag">{refreshMsg}</p>}
      </header>

      {tab === 'quote' && <QuotePanel />}
      {tab === 'trader' && <TraderDesk />}
      {tab === 'history' && <HistoryPanel />}

      <footer className="footer">
        الدفع لا يؤثر على ترتيب الأسعار أو وزن المؤشر. الصفقات الحقيقية تُجمع عبر موصل محلي
        بصلاحية قراءة فقط دون مغادرة المفتاح السري لجهاز التاجر.
      </footer>
    </div>
  )
}