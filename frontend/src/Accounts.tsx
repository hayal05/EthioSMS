import { useEffect, useState, type FormEvent } from 'react';
import { api } from './api';
import { Developer } from './Developer';
interface User { id:string;username:string;role:'admin'|'user';enabled?:boolean }
type Mode='login'|'token'|'initial';
export function Accounts({onSessionChange}:{onSessionChange?:(signedIn:boolean)=>void}) {
  const [user,setUser]=useState<User|null>(null),[mode,setMode]=useState<Mode>('login');
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState('');
  const [setupToken,setSetupToken]=useState(''),[setupKey,setSetupKey]=useState('');
  const [setupRequired,setSetupRequired]=useState(false),[setupAvailable,setSetupAvailable]=useState(false),[setupChecked,setSetupChecked]=useState(false);
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[users,setUsers]=useState<User[]>([]),[invite,setInvite]=useState(''),[issued,setIssued]=useState('');
  useEffect(()=>{onSessionChange?.(!!user);},[user,onSessionChange]);
  useEffect(()=>{void api('/auth/me').then(result=>setUser(result.user)).catch(()=>{});},[]);
  useEffect(()=>{void api('/auth/setup/status').then(result=>{
    setSetupRequired(!!result.setupRequired);setSetupAvailable(!!result.setupAvailable);
    if(result.setupRequired)setMode('initial');
  }).catch(()=>{}).finally(()=>setSetupChecked(true));},[]);
  useEffect(()=>{if(user?.role==='admin')void api('/admin/users').then(result=>setUsers(result.users)).catch(error=>setNotice(error.message));},[user]);
  async function submit(event:FormEvent) {
    event.preventDefault();setBusy(true);setNotice('');
    try {
      if(mode==='initial'){
        if(password!==confirmPassword)throw new Error('Passwords do not match');
        await api('/auth/setup/initial','POST',{username:username.toLowerCase(),password,setupKey});
        setSetupKey('');setConfirmPassword('');setPassword('');setMode('login');setSetupRequired(false);
        setNotice('Master Admin created successfully. Sign in with your new credentials.');
      } else if(mode==='token'){
        await api('/auth/setup','POST',{token:setupToken,password});setSetupToken('');setMode('login');setNotice('Password set. Sign in to continue.');
      } else {
        const result=await api('/auth/login','POST',{username,password});setUser(result.user);
      }
    }catch(error){setNotice(error instanceof Error?error.message:'Request failed');}finally{setPassword('');setConfirmPassword('');setBusy(false);}
  }
  async function adminAction(action:()=>Promise<void>){setBusy(true);setNotice('');setIssued('');try{await action();const result=await api('/admin/users');setUsers(result.users);}catch(error){setNotice(error instanceof Error?error.message:'Request failed');}finally{setBusy(false);}}
  const title=user?`Welcome, ${user.username}`:mode==='initial'?'Create Master Admin':mode==='token'?'Set your password':'Pilot sign in';
  return <><section className="accounts" aria-label="Pilot accounts"><h2>{title}</h2>
    {!user?<>{mode==='initial'&&!setupAvailable?<div className="setup-notice"><strong>First-time setup is not enabled yet.</strong><p>The service owner must add a private ADMIN_SETUP_KEY (at least 32 characters) to the hosting environment and redeploy.</p></div>:<form onSubmit={submit}>
      {mode==='initial'?<>
        <label>Master Admin username<input autoComplete="username" required minLength={3} maxLength={80} pattern="[a-z0-9][a-z0-9_.-]{2,79}" value={username} onChange={e=>setUsername(e.target.value.toLowerCase())}/></label>
        <label>Password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <label>Confirm password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>
        <label className="wide">Private one-time setup key<input type="password" autoComplete="off" minLength={32} required value={setupKey} onChange={e=>setSetupKey(e.target.value)}/></label>
        <p className="form-hint">This page is available only before the first administrator is created. Keep your setup key private.</p>
      </>:mode==='token'?<>
        <label className="wide">One-time invitation token<input autoComplete="off" required value={setupToken} onChange={e=>setSetupToken(e.target.value)}/></label>
        <label>Password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      </>:<>
        <label>Username<input autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)}/></label>
        <label>Password<input type="password" autoComplete="current-password" maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      </>}
      <button disabled={busy}>{busy?'Please wait…':mode==='initial'?'Create Master Admin':mode==='token'?'Set password':'Sign in'}</button>
    </form>}
    {mode==='login'&&<button className="secondary" onClick={()=>{setMode('token');setPassword('');setSetupToken('');setNotice('');}}>I have an invitation token</button>}
    {mode==='token'&&<button className="secondary" onClick={()=>{setMode('login');setPassword('');setSetupToken('');setNotice('');}}>Back to sign in</button>}
    {mode==='initial'&&setupAvailable&&<p className="form-hint">After creation, this first-time setup page is permanently disabled.</p>}
    </>:
    <><p>Signed in as {user.role}. Transport mode and message status are shown in your workspace.</p><button className="secondary" disabled={busy} onClick={()=>{setBusy(true);void api('/auth/logout','POST').then(()=>{setUser(null);setUsers([]);setIssued('');}).catch(error=>setNotice(error.message)).finally(()=>setBusy(false));}}>Sign out</button>
    {user.role==='admin'&&<><form onSubmit={event=>{event.preventDefault();void adminAction(async()=>{const result=await api('/admin/users','POST',{username:invite});setIssued(result.setupToken);setInvite('');});}}><label>Invite username<input required pattern="[a-z0-9][a-z0-9_.-]{2,79}" value={invite} onChange={e=>setInvite(e.target.value)}/></label><button disabled={busy}>Create invitation</button></form>
    {issued&&<div className="token"><strong>Share privately with this user. Expires in 24 hours.</strong><code>{issued}</code><button className="secondary" onClick={()=>setIssued('')}>Hide token</button></div>}
    <ul className="user-list">{users.map(item=><li key={item.id}><span>{item.username} · {item.enabled?'Enabled':'Disabled'}</span>{item.role==='user'&&<span className="actions"><button className="secondary" disabled={busy} onClick={()=>void adminAction(async()=>{await api(`/admin/users/${item.id}`,'PATCH',{enabled:!item.enabled});})}>{item.enabled?'Disable':'Enable'}</button><button className="secondary" disabled={busy||!item.enabled} onClick={()=>void adminAction(async()=>{const result=await api(`/admin/users/${item.id}/recovery`,'POST');setIssued(result.setupToken);})}>Reset access</button></span>}</li>)}</ul></>}
    </>}
    <p role="status">{notice}</p>
  </section>{user&&<Developer key={user.id} admin={user.role==='admin'}/>}</>;
}
