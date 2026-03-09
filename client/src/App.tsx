import React, { useEffect, useState } from 'react'
import { api } from './api'
import { format, isBefore, parseISO } from 'date-fns'
import type { Req, Status, Priority } from './types'

function StatCard({ title, value, color }:{title:string, value:number|string, color?:string}){
  return (
    <div className="card">
      <h4>{title}</h4>
      <div className="val" style={{color: color||'var(--text)'}}>{value}</div>
    </div>
  )
}

function useStats(){
  const [s, setS] = useState<any>({});
  useEffect(()=>{ api.stats().then(setS).catch(()=>{}) },[]);
  return s;
}

function Badge({status}:{status:Status}){
  const cls = status==='Open' ? 'open'
            : status==='In Progress' ? 'ip'
            : status==='Resolved' ? 'res'
            : 'esc';
  return <span className={`badge ${cls}`}>{status}</span>
}

export default function App(){
  const [items, setItems] = useState<Req[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage]   = useState(1)
  const [limit, setLimit] = useState(10)
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Status|''>('')
  const [priority, setPriority] = useState<Priority|''>('')
  const [assignee, setAssignee] = useState('')
  const [sort, setSort] = useState('-createdAt')
  const [selected, setSelected] = useState<Req|null>(null)
  const [showForm, setShowForm] = useState(false)
  const stats = useStats();

  async function load(){
    setLoading(true)
    try{
      const r = await api.list({ q, status, priority, assignee, page, limit, sort })
      setItems(r.items); setTotal(r.total)
    } finally{ setLoading(false) }
  }
  useEffect(()=>{ load() }, [q,status,priority,assignee,page,limit,sort])

  return (
    <div className="container">
      <div className="header">
        <h2 className="brand">Customer Intake & SLA Tracker</h2>
        <button className="btn primary" onClick={()=>setShowForm(true)}>+ New Request</button>
      </div>

      <div className="grid">
        <StatCard title="Open"        value={stats.open||0} />
        <StatCard title="In Progress" value={stats.inProgress||0} />
        <StatCard title="Resolved"    value={stats.resolved||0} color='var(--ok)' />
        <StatCard title="Escalated"   value={stats.escalated||0} color='var(--danger)' />
        <StatCard title="Due Today / Breached" value={`${stats.dueToday||0} / ${stats.breached||0}`} color='var(--warn)' />
      </div>

      <div className="panel">
        <div className="toolbar">
          <input placeholder="Search" value={q} onChange={e=>{setQ(e.target.value); setPage(1)}} />
          <select value={status} onChange={e=>{setStatus(e.target.value as any); setPage(1)}}>
            <option value="">Status</option>
            {['Open','In Progress','Resolved','Escalated'].map(s=> <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={priority} onChange={e=>{setPriority(e.target.value as any); setPage(1)}}>
            <option value="">Priority</option>
            {['Low','Medium','High'].map(p=> <option key={p} value={p}>{p}</option>)}
          </select>
          <input placeholder="Assignee" value={assignee} onChange={e=>{setAssignee(e.target.value); setPage(1)}} />
          <select value={sort} onChange={e=>{setSort(e.target.value) }}>
            <option value="-createdAt">Newest</option>
            <option value="createdAt">Oldest</option>
            <option value="priority">Priority (A→Z)</option>
            <option value="-priority">Priority (Z→A)</option>
          </select>
        </div>

        <div style={{padding:'10px 12px'}}>
          <table className="table">
            <thead>
              <tr>
                <th>Title</th><th>Customer</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Due</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.map(r=> (
                <tr key={r._id}>
                  <td>{r.title}</td>
                  <td className="muted">{r.customer}</td>
                  <td>{r.priority}</td>
                  <td><Badge status={r.status} /></td>
                  <td>{r.assignee||'-'}</td>
                  <td>{r.dueDate? format(parseISO(r.dueDate), 'dd MMM') : '-'}</td>
                  <td className="row-actions">
                    <button className="btn" onClick={()=> setSelected(r)}>View</button>
                    <button className="btn" onClick={async()=>{
                      const title = prompt('New title', r.title);
                      if(!title) return;
                      await api.update(r._id,{ title }); 
                      load(); 
                    }}>Quick Edit</button>
                    <button className="btn danger" onClick={async()=>{
                      if(!confirm('Delete?')) return;
                      await api.remove(r._id);
                      load();
                    }}>Delete</button>
                  </td>
                </tr>
              ))}
              {!items.length && !loading && (
                <tr><td colSpan={7} className="muted">No data. Add a request.</td></tr>
              )}
            </tbody>
          </table>

          <div style={{display:'flex', gap:8, alignItems:'center', justifyContent:'flex-end', padding:'10px 0'}}>
            <span className="muted">{(page-1)*limit+1}-{Math.min(page*limit,total)} of {total}</span>
            <button className="btn" onClick={()=> setPage(p=> Math.max(1, p-1))}>Prev</button>
            <button className="btn" onClick={()=> setPage(p=> (p*limit<total? p+1 : p))}>Next</button>
            <select value={limit} onChange={e=> setLimit(parseInt(e.target.value))}>
              {[10,20,50].map(n=> <option key={n} value={n}>{n}/page</option>)}
            </select>
          </div>
        </div>
      </div>

      {showForm && <RequestForm onClose={()=> setShowForm(false)} onCreated={()=>{ setShowForm(false); load(); }} />}
      {selected && <RequestDetails id={selected._id} onClose={()=> setSelected(null)} onChanged={load} />}
    </div>
  )
}

function RequestForm({ onClose, onCreated }:{ onClose:()=>void, onCreated:()=>void }){
  const [form, setForm] = useState<any>({ priority:'Medium', status:'Open' })
  const set = (k:string, v:any)=> setForm((f:any)=> ({...f, [k]: v}))

  async function submit(){
    if(!form.customer || !form.title){ alert('Customer & Title required'); return; }
    await api.create({ 
      ...form, 
      tags: form.tags? String(form.tags).split(',').map((s:string)=>s.trim()) : [] 
    })
    onCreated()
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={(e)=>e.stopPropagation()}>
        <h3 style={{marginTop:0}}>New Request</h3>
        <div className="form-grid">
          <input placeholder="Customer" onChange={e=>set('customer', e.target.value)} />
          <input placeholder="Title" onChange={e=>set('title', e.target.value)} />
          <textarea placeholder="Description" rows={3} style={{gridColumn:'1/3'}} onChange={e=>set('description', e.target.value)} />
          <select onChange={e=>set('priority', e.target.value)} defaultValue={'Medium'}>
            {['Low','Medium','High'].map(p=> <option key={p} value={p}>{p}</option>)}
          </select>
          <select onChange={e=>set('status', e.target.value)} defaultValue={'Open'}>
            {['Open','In Progress','Resolved','Escalated'].map(s=> <option key={s} value={s}>{s}</option>)}
          </select>
          <input placeholder="Assignee" onChange={e=>set('assignee', e.target.value)} />
          <input type="date" onChange={e=>set('dueDate', e.target.value? new Date(e.target.value).toISOString(): undefined)} />
          <input placeholder="Tags (comma-separated)" style={{gridColumn:'1/3'}} onChange={e=>set('tags', e.target.value)} />
        </div>
        <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:12}}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Create</button>
        </div>
      </div>
    </div>
  )
}

function RequestDetails({ id, onClose, onChanged }:{ id:string, onClose:()=>void, onChanged:()=>void }){
  const [r, setR] = useState<Req|null>(null)
  const [comment, setComment] = useState('')
  useEffect(()=>{ api.one(id).then(setR) },[id])

  if(!r) return null
  const overdue = r.dueDate && isBefore(parseISO(r.dueDate), new Date()) && (r.status==='Open')

  async function update(partial:any){ 
    await api.update(id, partial); 
    const fresh = await api.one(id); 
    setR(fresh); 
    onChanged() 
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={(e)=>e.stopPropagation()}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h3 style={{marginTop:0}}>{r.title}</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="detail">
          <div className="section">
            <h4>Details</h4>
            <div className="muted">Customer</div>
            <div>{r.customer}</div>
            <hr className="sep" />
            <div className="muted">Description</div>
            <div>{r.description||'-'}</div>
            <hr className="sep" />
            <div className="muted">Tags</div>
            <div>{(r.tags||[]).join(', ')||'-'}</div>
          </div>

          <div className="section">
            <h4>Controls</h4>
            <div className="muted">Status</div>
            <select value={r.status} onChange={e=> update({ status:e.target.value })}>
              {['Open','In Progress','Resolved','Escalated'].map(s=> <option key={s} value={s}>{s}</option>)}
            </select>

            <div className="muted" style={{marginTop:8}}>Priority</div>
            <select value={r.priority} onChange={e=> update({ priority:e.target.value })}>
              {['Low','Medium','High'].map(p=> <option key={p} value={p}>{p}</option>)}
            </select>

            <div className="muted" style={{marginTop:8}}>Assignee</div>
            <input value={r.assignee||''} onChange={e=> update({ assignee: e.target.value })} />

            <div className="muted" style={{marginTop:8}}>Due Date</div>
            <input
              type="date"
              value={r.dueDate? format(parseISO(r.dueDate), 'yyyy-MM-dd'): ''}
              onChange={e=> update({ dueDate: e.target.value? new Date(e.target.value).toISOString(): null })}
            />
            {overdue && <div className="muted" style={{color:'var(--danger)', marginTop:8}}>Overdue — will auto‑escalate</div>}
          </div>
        </div>

        <div className="detail">
          <div className="section">
            <h4>Comments</h4>
            <div style={{display:'flex', gap:8, marginBottom:8}}>
              <input placeholder="Add a comment" value={comment} onChange={e=> setComment(e.target.value)} />
              <button className="btn" onClick={async()=>{
                if(!comment) return;
                await api.comment(r._id, comment); 
                setComment('');
                const fresh = await api.one(id); 
                setR(fresh)
              }}>Add</button>
            </div>
            <div>
              {(r.comments||[]).slice().reverse().map((c,i)=> (
                <div key={i} style={{marginBottom:8}}>
                  <div className="muted">{new Date(c.at).toLocaleString()} — {c.by||'user'}</div>
                  <div>{c.text}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="section">
            <h4>Audit Trail</h4>
            <div className="muted" style={{fontSize:13}}>(Last 10)</div>
            <div>
              {(r.audit||[]).slice(-10).reverse().map((a,i)=> (
                <div key={i} style={{marginBottom:8}}>
                  <div className="muted">{new Date(a.at).toLocaleString()} — {a.by} — {a.action}</div>
                  {a.diff && <pre style={{whiteSpace:'pre-wrap', fontSize:12}}>{JSON.stringify(a.diff, null, 2)}</pre>}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}