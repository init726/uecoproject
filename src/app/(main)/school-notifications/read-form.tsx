"use client";
import {useActionState} from "react";
import {markRead} from "./actions";
import {Button} from "@/components/ui/button";
import {FormMessage} from "@/components/form-message";
export function ReadForm(){const [state,action,pending]=useActionState(markRead,{});return <form action={action} className="space-y-2"><Button disabled={pending} variant="outline">모두 읽음</Button><FormMessage state={state}/></form>;}
