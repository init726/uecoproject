export type SurveyQuestion={title:string;type:"single"|"multiple"|"text";options?:string[]};
export type Survey={id:string;class_id:string;title:string;questions:SurveyQuestion[];anonymous:boolean;due_at:string;closed:boolean};
export type SurveyResults={count:number;withheld:boolean;responses:{answers:(string|number|number[])[];name?:string;student_no?:string}[]};
export function optionCounts(results:SurveyResults,index:number,optionCount:number) {
 const counts=Array<number>(optionCount).fill(0);
 for(const r of results.responses) {const answer=r.answers[index];for(const value of typeof answer==="number"?[answer]:Array.isArray(answer)?answer:[]) if(Number.isInteger(value)&&value>=0&&value<optionCount)counts[value]++;}
 return counts;
}
