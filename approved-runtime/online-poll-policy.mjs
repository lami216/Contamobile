// Foreground-only scheduling; this is not an entitlement or financial clock.
export function onlinePollDelay(idleForMs,random=Math.random()){
 const base=idleForMs>=45000?12000:8000;
 return Math.round(base*(0.95+Math.min(1,Math.max(0,Number(random)||0))*0.1));
}
