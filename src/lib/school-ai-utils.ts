export function redactPersonalData(text:string, names:string[]=[]) {
 let result=text;
 for(const name of [...new Set(names)].filter(Boolean).sort((a,b)=>b.length-a.length)) result=result.split(name).join("[개인정보]");
 return result.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[이메일]").replace(/\b\d{6}[- ]?[1-4]\d{6}\b/g,"[식별번호]").replace(/(?:\+82[- ]?)?0?1[016789][- .]?\d{3,4}[- .]?\d{4}/g,"[전화번호]").replace(/\b\d{5,12}\b/g,"[번호]");
}
