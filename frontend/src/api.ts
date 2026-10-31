export async function api(path:string, method='GET', data?:unknown) {
  const response=await fetch(`/api${path}`,{method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-EthioSMS-Request':'1'},body:data===undefined?undefined:JSON.stringify(data)});
  const result=response.status===204?{}:await response.json();
  if(!response.ok)throw new Error(result.error??'Request failed');return result;
}
