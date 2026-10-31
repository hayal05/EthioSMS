import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import { Developer } from './Developer';
interface User { id:string;username:string;role:'admin'|'user';enabled?:boolean }
export function Accounts() {
  const [user,setUser]=useState<User|null>(null),[mode,setMode]=useState<'login'|'setup'>('login');
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[setupToken,setSetupToken]=useState('');
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[users,setUsers]=useState<User[]>([]),[invite,setInvite]=useState(''),[issued,setIssued]=useState('');
  useEffect(()=>{void api('/auth/me').then(result=>setUser(result.user)).catch(()=>{});},[]);
  useEffect(()=>{if(user?.role==='admin')void api('/admin/users').then(result=>setUsers(result.users)).catch(error=>setNotice(error.message));},[user]);
  async function submit(event:FormEvent) {
    event.preventDefault();setBusy(true);setNotice('');
    try {
      if(mode==='setup'){await api('/auth/setup','POST',{token:setupToken,password});setSetupToken('');setMode('login');setNotice('Password set. Sign in to continue.');}
      else {const result=await api('/auth/login','POST',{username,password});setUser(result.user);}
    }catch(error){setNotice(error instanceof Error?error.message:'Request failed');}finally{setPassword('');setBusy(false);}
  }
  async function adminAction(action:()=>Promise<void>){setBusy(true);setNotice('');setIssued('');try{await action();const result=await api('/admin/users');setUsers(result.users);}catch(error){setNotice(error instanceof Error?error.message:'Request failed');}finally{setBusy(false);}}
  return <><section className="accounts" aria-label="Pilot accounts"><h2>{user?`Welcome, ${user.username}`:mode==='setup'?'Set your password':'Pilot sign in'}</h2>
    {!user?<><form onSubmit={submit}>
      {mode==='login'?<label>Username<input autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)}/></label>:<label>One-time setup token<input autoComplete="off" required value={setupToken} onChange={e=>setSetupToken(e.target.value)}/></label>}
      <label>Password<input type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='setup'?12:undefined} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <button disabled={busy}>{busy?'Please wait…':mode==='login'?'Sign in':'Set password'}</button>
    </form><button className="secondary" onClick={()=>{setMode(mode==='login'?'setup':'login');setPassword('');setSetupToken('');setNotice('');}}>{mode==='login'?'I have a setup token':'Back to sign in'}</button></>:
    <><p>Signed in as {user.role}. Message sending is not available yet.</p><button className="secondary" disabled={busy} onClick={()=>{setBusy(true);void api('/auth/logout','POST').then(()=>{setUser(null);setUsers([]);setIssued('');}).catch(error=>setNotice(error.message)).finally(()=>setBusy(false));}}>Sign out</button>
    {user.role==='admin'&&<><form onSubmit={event=>{event.preventDefault();void adminAction(async()=>{const result=await api('/admin/users','POST',{username:invite});setIssued(result.setupToken);setInvite('');});}}><label>Invite username<input required pattern="[a-z0-9][a-z0-9_.-]{2,79}" value={invite} onChange={e=>setInvite(e.target.value)}/></label><button disabled={busy}>Create invitation</button></form>
    {issued&&<div className="token"><strong>Share privately with this user. Expires in 24 hours.</strong><code>{issued}</code><button className="secondary" onClick={()=>setIssued('')}>Hide token</button></div>}
    <ul className="user-list">{users.map(item=><li key={item.id}><span>{item.username} · {item.enabled?'Enabled':'Disabled'}</span>{item.role==='user'&&<span className="actions"><button className="secondary" disabled={busy} onClick={()=>void adminAction(async()=>{await api(`/admin/users/${item.id}`,'PATCH',{enabled:!item.enabled});})}>{item.enabled?'Disable':'Enable'}</button><button className="secondary" disabled={busy||!item.enabled} onClick={()=>void adminAction(async()=>{const result=await api(`/admin/users/${item.id}/recovery`,'POST');setIssued(result.setupToken);})}>Reset access</button></span>}</li>)}</ul></>}
    </>}
    <p role="status">{notice}</p>
  </section>{user&&<Developer key={user.id} admin={user.role==='admin'}/>}</>;
}
