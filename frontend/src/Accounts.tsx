import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import { Developer } from './Developer';
interface User { id:string;username:string;role:'admin'|'user';enabled?:boolean }
export function Accounts({onSessionChange}:{onSessionChange?:(signedIn:boolean)=>void}) {
  const [user,setUser]=useState<User|null>(null),[mode,setMode]=useState<'login'|'setup'>('login');
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[setupToken,setSetupToken]=useState('');
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{onSessionChange?.(!!user);},[user,onSessionChange]);
  useEffect(()=>{void api('/auth/me').then(result=>setUser(result.user)).catch(()=>{});},[]);
  async function submit(event:FormEvent) {
    event.preventDefault();setBusy(true);setNotice('');
    try {
      if(mode==='setup'){await api('/auth/setup','POST',{token:setupToken,password});setSetupToken('');setMode('login');setNotice('Password set. Sign in to continue.');}
      else {const result=await api('/auth/login','POST',{username,password});setUser(result.user);}
    }catch(error){setNotice(error instanceof Error?error.message:'Request failed');}finally{setPassword('');setBusy(false);}
  }
  return <><section className="accounts" aria-label="Pilot accounts"><h2>{user?`Welcome, ${user.username}`:mode==='setup'?'Set your password':'Pilot sign in'}</h2>
    {!user?<><form onSubmit={submit}>
      {mode==='login'?<label>Username<input autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)}/></label>:<label>One-time setup token<input autoComplete="off" required value={setupToken} onChange={e=>setSetupToken(e.target.value)}/></label>}
      <label>Password<input type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='setup'?12:undefined} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <button disabled={busy}>{busy?'Please wait…':mode==='login'?'Sign in':'Set password'}</button>
    </form><button className="secondary" onClick={()=>{setMode(mode==='login'?'setup':'login');setPassword('');setSetupToken('');setNotice('');}}>{mode==='login'?'I have a setup token':'Back to sign in'}</button></>:
    <><p>Signed in as {user.role}. Transport mode and message status are shown in your workspace.</p><button className="secondary" disabled={busy} onClick={()=>{setBusy(true);void api('/auth/logout','POST').then(()=>{setUser(null);}).catch(error=>setNotice(error.message)).finally(()=>setBusy(false));}}>Sign out</button>
    </>}
    <p role="status">{notice}</p>
  </section>{user&&<Developer key={user.id} admin={user.role==='admin'}/>}</>;
}
