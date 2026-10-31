export async function api(path:string, method='GET', data?:unknown,extraHeaders:Record<string,string>={}) {
  const response=await fetch(`/api${path}`,{method,headers:method==='GET'?extraHeaders:{'Content-Type':'application/json','X-EthioSMS-Request':'1',...extraHeaders},body:data===undefined?undefined:JSON.stringify(data)});
  const result=response.status===204?{}:await response.json();
  if(!response.ok)throw new Error(result.error??'Request failed');return result;
}
