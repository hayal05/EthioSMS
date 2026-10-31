export const mockScenarios=['success','rejected','timeout','offline','delayed'] as const;
export type MockScenario=typeof mockScenarios[number];
export type MockResult={outcome:'accepted';providerId:string}|{outcome:'rejected'|'unknown'|'retryable';code:string};
// Pure simulation: this adapter has no network or telephony dependencies.
export class MockGateway {
  constructor(private now:()=>number=Date.now){}
  async submit(request:{requestId:string;scenario:MockScenario}):Promise<MockResult>{
    switch(request.scenario){
      case 'rejected':return {outcome:'rejected',code:'MOCK_REJECTED'};
      case 'timeout':return {outcome:'unknown',code:'MOCK_TIMEOUT'};
      case 'offline':return {outcome:'retryable',code:'MOCK_OFFLINE'};
      default:return {outcome:'accepted',providerId:`mock_${request.requestId}`};
    }
  }
  async status(request:{scenario:MockScenario;submittedAt:number}):Promise<'accepted'|'delivered'|'unknown'|'failed'>{
    if(request.scenario==='timeout'||request.scenario==='offline')return 'unknown';
    if(request.scenario==='rejected')return 'failed';
    if(request.scenario==='delayed'&&this.now()-request.submittedAt<30_000)return 'accepted';
    return 'delivered';
  }
}
