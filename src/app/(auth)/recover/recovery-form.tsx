"use client";
import {useActionState} from "react";
import {requestRecovery} from "./actions";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {FormMessage} from "@/components/form-message";
export function RecoveryForm(){const [state,action,pending]=useActionState(requestRecovery,{});return <form action={action} className="space-y-4"><label className="block space-y-2"><span>아이디</span><Input name="username" autoCapitalize="none" required maxLength={30}/></label><label className="block space-y-2"><span>이름</span><Input name="name" required maxLength={50}/></label><label className="block space-y-2"><span>학번 (학생)</span><Input name="student_no" maxLength={20}/></label><p className="text-xs text-muted-foreground">이름·아이디·학번은 계정 복구 확인을 위해 학교 관리자에게 전달됩니다. 비밀번호나 주민등록번호는 입력하지 마세요.</p><FormMessage state={state}/><Button disabled={pending}>{pending?"접수 중…":"학교에 복구 요청"}</Button></form>;}
