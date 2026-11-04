/** Authored illustrations and saved evidence only. No runtime data or network access. */
export function renderExhibit(path: string, zh: boolean) {
 const t=(en:string,cn:string)=>zh?cn:en;
 const box=(label:string,value:string,detail:string)=>`<div class="specimen"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
 const route=(names:string[],active:number)=>`<div class="mini-route">${names.map((n,i)=>`<span class="${i===active?'lit':i<active?'passed':''}">${n}</span>`).join('')}</div>`;
 const terminal=(lines:string[])=>`<div class="terminal"><div class="terminal-bar"><i></i><i></i><i></i><span>agentpay / protocol</span></div>${lines.map((line,i)=>`<div class="terminal-line"><span>0${i+1}</span><code>${line}</code></div>`).join('')}</div>`;
 type Frame={title:string; caption:string; art:string; label:string};
 let label='',name='',frames:Frame[]=[];
 if(path==='/') {
  label=t('CONCEPT · PLANNED INTEGRATION','概念 · 计划整合');name=t('From intent to a paid capability','从意图到付费能力');
  const names=['Agent','AIPlans','Toolkit','AgentPay'];
  frames=[
   {label:t('Intent','任务'),title:t('A goal. A boundary.','一个目标，一条边界。'),caption:t('An agent needs a capability. The owner sets what it may spend.','Agent 需要能力，由所有者设定可支出的范围。'),art:route(names,0)+box('AGENT / GOAL',t('Fix the retry bug','修复重试错误'),t('Illustrative task · not a live model call','示例任务 · 非实时模型调用'))},
   {label:t('Discover','发现'),title:t('Find an executable offer.','找到可执行的报价。'),caption:t('AIPlans metadata meets Toolkit machine offers. Discovery is not permission to pay.','AIPlans 元数据与 Toolkit 机器报价结合。发现不代表付款许可。'),art:route(names,1)+`<div class="offer-compare">${box('AIPlans','Model identity',t('Metadata / channels','元数据 / 渠道'))}${box('Toolkit','Machine offer',t('Merchant / limits','商户 / 限额'))}</div>`},
   {label:t('Authorize','授权'),title:t('Spend within the policy.','在策略范围内支出。'),caption:t('The payment gate checks the recipient, asset, network and ceiling before authorization.','支付关口先检查收款人、资产、网络与额度，再进行授权。'),art:route(names,3)+`<div class="policy-dial"><span class="dial-ring"></span><div><small>OWNER POLICY</small><strong>0.10 <em>USDC</em></strong><p>${t('Example ceiling · not the current fee','示例上限 · 并非本次费用')}</p></div></div>`},
   {label:t('Recover','恢复'),title:t('Keep the result recoverable.','让结果始终可恢复。'),caption:t('A durable receipt links payment and delivery. Autonomous model-task continuation is planned.','持久凭证连接付款与交付。模型任务自主续行仍在规划中。'),art:route(names,3)+terminal(['order: DEMO-001','timeout → pending','reconcile same order','✓ result + receipt · no second payment'])}
  ];
 } else if(path==='/demo') {
  label=t('SAVED REAL RUN · SOLANA DEVNET','已保存实测 · SOLANA DEVNET');name=t('Follow the verified purchase','拆解已验证的采购');
  frames=[
   {label:t('Quote','报价'),title:t('One report. One fixed price.','一份报告，固定价格。'),caption:t('The recorded purchase used x402 exact. This playback creates no quote or transaction.','这笔已完成的采购使用 x402 exact。回放不创建报价或交易。'),art:`<div class="huge-metric"><small>HTTP 402 / EXACT</small><strong>0.001</strong><span>test USDC</span></div>`},
   {label:t('Transfer','转账'),title:t('Value moved on Devnet.','价值在 Devnet 上转移。'),caption:t('Saved token balances show a 0.001 test USDC transfer. These are historical balances, not a live account check.','已保存的代币余额证明转移了 0.001 测试 USDC。这是历史余额，不是实时查账。'),art:`<div class="transfer-pair">${box(t('PAYER','付款方'),'20 → 19.999','test USDC')}<div class="transfer-wire" aria-hidden="true">→</div>${box(t('MERCHANT','收款方'),'20 → 20.001','test USDC')}</div>`},
   {label:t('Verify','核验'),title:t('Finalized. No chain error.','已最终确认，无链上错误。'),caption:t('Recorded on November 3, 2026. Verify the full transaction through the separate Explorer link.','记录于 2026 年 11 月 3 日。可通过独立 Explorer 链接核验完整交易。'),art:`<div class="seal"><span>✓</span><strong>FINALIZED</strong><small>slot 518099003 · err: null</small></div>`},
   {label:t('Deliver','交付'),title:t('A computed result, delivered.','真实计算，完成交付。'),caption:t('Sample inputs, real integer calculation and real Devnet settlement. This budget is not wallet spending authority.','示例输入、真实整数计算与真实 Devnet 结算。报告预算不等于钱包支出授权。'),art:`<div class="calculation"><span>5 − 1 − (0.25 × 3)</span><strong>= 3.25</strong><small>HTTP 200 · delivered</small></div>`}
  ];
 } else if(path==='/developers') {
  label=t('PROTOCOL WALKTHROUGH · ILLUSTRATIVE','协议流程 · 示意');name=t('The contract in four exchanges','四次交互，看懂协议');
  frames=[
   {label:'Request',title:t('Ask for the paid resource.','请求付费资源。'),caption:t('A same-origin session owns the order. Identifiers below are placeholders, not executable requests.','同源会话拥有订单。下方标识为占位符，不会执行请求。'),art:terminal(['POST /api/orders/{id}/report','Content-Type: application/json','{ budgetAtomic: "5000000", … }','← resource remains locked'])},
   {label:'402',title:t('Make the payment terms explicit.','明确付款条件。'),caption:t('Network, mint, recipient, amount and expiry are checked before the wallet request.','请求钱包前检查网络、mint、收款人、金额与有效期。'),art:terminal(['HTTP/1.1 402 Payment Required','PAYMENT-REQUIRED: &lt;encoded terms&gt;','scheme: exact · network: Solana Devnet','amount: 1000 atomic test USDC'])},
   {label:'Verify',title:t('Verify before delivery.','先核验，再交付。'),caption:t('The user signs and explicitly submits. The service verifies settlement independently; this panel signs nothing.','用户签名并明确提交。服务独立核验结算；本面板不签名。'),art:terminal(['PAYMENT-SIGNATURE: &lt;user payload&gt;','facilitator → verify / settle','chain evidence → match order + mint','timeout? → pending; never resubmit'])},
   {label:'200',title:t('Recover the same purchase.','恢复同一笔采购。'),caption:t('Confirmed payment releases the report. Pending orders reconcile under the same identity, without a second charge.','付款确认后放行报告。pending 订单按原身份对账，不再次收费。'),art:terminal(['HTTP/1.1 200 OK','PAYMENT-RESPONSE: &lt;settlement proof&gt;','state: delivered · report: { … }','retry same order → same saved result'])}
  ];
 } else if(path==='/history/monad') {
  label=t('HISTORICAL FIXTURE · NO NEW TRANSACTION','历史夹具 · 无新交易');name=t('The original Monad chapter','最初的 Monad 篇章');
  frames=[
   {label:t('Discover','发现'),title:t('Compare before spending.','支出前，先比较。'),caption:t('Adapted from the original three-act replay. AIPlans metadata and Toolkit offers illustrated model procurement.','改编自原三幕回放。AIPlans 元数据与 Toolkit 报价用于示意模型采购。'),art:route(['Agent','AIPlans','Toolkit'],1)+box('ARCHIVE / ACT I','Model → offer',t('Recorded fixture, not current readiness','录制夹具，不证明当前 readiness'))},
   {label:t('Reserve','预留'),title:t('Bound the authorization.','限定授权范围。'),caption:t('Monad uses an EVM authorization path: x402 upto and Permit2. Its sample cap is not a Solana quote.','Monad 使用 EVM 授权路径：x402 upto 与 Permit2。示例上限不是 Solana 报价。'),art:`<div class="huge-metric"><small>MONAD / SAMPLE CEILING</small><strong>0.10</strong><span>USDC · upto / Permit2</span></div>`},
   {label:t('Receipt','凭证'),title:t('Keep usage and proof together.','用量与凭证，保持关联。'),caption:t('Historical model execution and receipt work informed the product. This animation does not invoke a provider or recreate that purchase.','历史模型执行与凭证工作构成产品基础。本动画不调用服务商，也不重复历史采购。'),art:terminal(['ARCHIVE / ACT III','provider usage → reconciliation','purchase → durable receipt','replay only · zero new transactions'])}
  ];
 } else {
  label=t('NETWORK CONCEPT · CAPABILITIES DIFFER','网络概念 · 能力有别');name=t('One intent, different contracts','一个意图，不同支付约定');
  frames=[
   {label:'Monad',title:t('Metered, within a ceiling.','按用量结算，不越上限。'),caption:t('Existing Monad reference: x402 upto + Permit2. Live operation still requires readiness.','已有 Monad 参考实现：x402 upto + Permit2。实时运行仍需 readiness。'),art:`<div class="network-orbit"><div class="orbit-ring"></div><strong>Monad</strong><span>UPTO / PERMIT2</span></div>`},
   {label:'Base',title:t('A future payment adapter.','未来的支付适配器。'),caption:t('Base is a concept in this project. No live Base payment adapter or transaction is demonstrated here.','Base 在本项目中属于概念。这里没有展示已上线的 Base 支付适配器或交易。'),art:`<div class="network-orbit amber"><div class="orbit-ring"></div><strong>Base</strong><span>CONCEPT ONLY</span></div>`},
   {label:'Solana',title:t('Exact price. Verified report.','准确价格，已验证报告。'),caption:t('The independent Devnet report purchase works. Connecting it to model procurement remains planned. Solana does not use Permit2.','独立 Devnet 报告采购已打通。接入模型采购仍在规划中，Solana 不使用 Permit2。'),art:`<div class="network-orbit"><div class="orbit-ring"></div><strong>Solana</strong><span>EXACT / DEVNET</span></div>`}
  ];
 }
 return `<aside class="exhibit" data-exhibit aria-label="${name}"><div class="exhibit-top"><span class="exhibit-dot"></span><span>${label}</span><span data-exhibit-count>01 / 0${frames.length}</span></div><div class="exhibit-screen" aria-live="off">${frames.map((f,i)=>`<article data-exhibit-frame ${i?'hidden':''}><div class="exhibit-art">${f.art}</div><div class="exhibit-caption"><h2>${f.title}</h2><p>${f.caption}</p></div></article>`).join('')}</div><div class="exhibit-chapters" role="group" aria-label="${t('Scenes','场景')}">${frames.map((f,i)=>`<button data-exhibit-index="${i}" aria-pressed="${i===0}"><span>0${i+1}</span>${f.label}</button>`).join('')}</div><div class="exhibit-controls"><button data-exhibit-play data-play="${t('Play','播放')}" data-pause="${t('Pause','暂停')}">${t('Play','播放')}</button><button data-exhibit-next>${t('Next','下一步')}</button><button data-exhibit-reset>${t('Restart','重播')}</button><small data-exhibit-note>${t('One automatic playthrough · no payment','自动播放一轮 · 不产生付款')}</small></div><p class="sr-only" data-exhibit-status role="status"></p></aside>`;
}
