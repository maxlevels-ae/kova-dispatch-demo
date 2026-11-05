// First instant of a local calendar day, including DST transitions at midnight.
export function countryDayStart(timeZone, daysAgo=0, now=new Date()) {
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
 const key=date=>{const p=Object.fromEntries(formatter.formatToParts(date).map(v=>[v.type,v.value]));return p.year+'-'+p.month+'-'+p.day;};
 const targetDate=new Date(key(now)+'T12:00:00Z');targetDate.setUTCDate(targetDate.getUTCDate()-daysAgo);
 const target=targetDate.toISOString().slice(0,10);let low=+targetDate-86400000,high=+targetDate+86400000;
 while(high-low>1){const middle=Math.floor((low+high)/2);if(key(new Date(middle))<target)low=middle;else high=middle;}
 return new Date(high);
}
