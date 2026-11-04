import { OrderStore, ReportService, SvmGateway } from '../../packages/solana-report/src/index.js';
import { OfflineRail, OFFLINE_PAYER, OFFLINE_MERCHANT, fixtureHeader } from '../../packages/solana-report/src/offline.js';
/** Actual application state machine, isolated mock rail; never contacts RPC/facilitator. */
export async function judgeExamples() {
  const store=new OrderStore(':memory:','offline');const rail=new OfflineRail();
  const gateway=new SvmGateway(rail,rail,OFFLINE_MERCHANT);await gateway.initialize();
  const service=new ReportService(store,gateway,'offline','http://localhost:4030');
  const input={budgetAtomic:'5000000',spentAtomic:'1000000',quoteAtomic:'250000',quantity:3};
  try {
    const rejected=await service.quote(input,OFFLINE_PAYER);rail.invalidReason='insufficient_funds';
    let error='';try { await service.purchase(rejected.id,input,fixtureHeader(rejected)); }catch(e){error=e instanceof Error?e.message:String(e);}
    const failure={error,state:store.get(rejected.id).state,reportReleased:!!store.get(rejected.id).report,settleCalls:rail.calls.settle};
    rail.invalidReason=undefined;const accepted=await service.quote(input,OFFLINE_PAYER);const header=fixtureHeader(accepted);
    const first=await service.purchase(accepted.id,input,header);const retry=await service.purchase(accepted.id,input,header);
    return {mode:'offline-simulation',notice:'Mock facilitator/RPC. No wallet, signature or blockchain payment.',failure,retry:{state:retry.state,sameResult:first.resultDigest===retry.resultDigest,settleCalls:rail.calls.settle,report:retry.report}};
  }finally{store.close();}
}
