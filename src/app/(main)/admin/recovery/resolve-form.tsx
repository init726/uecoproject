"use client";
import {useActionState} from "react";
import {resolveRecovery} from "./actions";
import {Button} from "@/components/ui/button";
import {FormMessage} from "@/components/form-message";
export function ResolveForm({id}:{id:string}){const [state,action,pending]=useActionState(resolveRecovery.bind(null,id),{});return <form action={action} className="mt-3 space-y-2"><label className="flex flex-wrap gap-2 text-sm">처리 결과<select name="status" className="form-select w-auto"><option value="resolved">본인 확인 및 전달 완료</option><option value="rejected">확인 불가·반려</option></select></label><Button size="sm" disabled={pending}>처리 저장</Button><FormMessage state={state}/></form>;}
