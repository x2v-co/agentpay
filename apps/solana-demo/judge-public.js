const button=document.getElementById('examples');
const zh=document.documentElement.lang.startsWith('zh');
button.onclick=async()=>{button.disabled=true;const result=document.getElementById('result');result.textContent=zh?'正在运行隔离的离线模拟…':'Running isolated offline simulation…';try{const response=await fetch('/api/examples');if(!response.ok)throw new Error('unavailable');const data=await response.json();result.textContent=JSON.stringify(data,null,2);}catch{result.textContent=zh?'示例暂不可用。未尝试付款。':'Example unavailable. No payment was attempted.';}finally{button.disabled=false;}};
