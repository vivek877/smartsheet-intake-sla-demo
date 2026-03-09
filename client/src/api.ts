const API = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

async function http(path: string, init?: RequestInit){
  const r = await fetch(`${API}${path}`, { headers: { 'Content-Type':'application/json' }, ...init });
  if (!r.ok) throw new Error((await r.json().catch(()=>({message:r.statusText}))).message);
  return r.json();
}

export const api = {
  list: (params: Record<string, any>= {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([_,v])=>v!==undefined && v!==''))
    return http(`/api/requests?${qs.toString()}`)
  },
  create: (data:any)=> http('/api/requests', { method:'POST', body: JSON.stringify(data) }),
  one: (id:string)=> http(`/api/requests/${id}`),
  update: (id:string, data:any)=> http(`/api/requests/${id}`, { method:'PATCH', body: JSON.stringify(data) }),
  remove: (id:string)=> fetch(`${API}/api/requests/${id}`, { method:'DELETE' }),
  comment: (id:string, text:string)=> http(`/api/requests/${id}/comments`, { method:'POST', body: JSON.stringify({ text }) }),
  stats: ()=> http('/api/stats/summary')
}